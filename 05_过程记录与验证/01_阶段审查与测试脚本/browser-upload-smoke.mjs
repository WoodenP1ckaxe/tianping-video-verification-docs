import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightRoot = process.env.PLAYWRIGHT_NODE_MODULES
  || 'C:\\Users\\CYF\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules';
const { chromium } = require(`${playwrightRoot}\\playwright`);

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:18081';
const account = process.env.SMOKE_ACCOUNT || 'U001';
const password = process.env.SMOKE_PASSWORD || 'UiCheck1234';
const initialPassword = process.env.SMOKE_INITIAL_PASSWORD || password;
const videoPath = process.env.SMOKE_VIDEO_PATH;
const executablePath = process.env.CHROMIUM_PATH || undefined;

if (!videoPath) throw new Error('SMOKE_VIDEO_PATH is required');

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('form[data-form="login"]', { timeout: 15_000 });
  await page.locator('#login-account').fill(account);
  await page.locator('#login-password').fill(initialPassword);
  await page.locator('form[data-form="login"] [type="submit"]').click();
  const changeForm = page.locator('form[data-form="change-password"]');
  await Promise.race([
    changeForm.waitFor({ state: 'visible', timeout: 15_000 }),
    page.locator('.app-shell').waitFor({ state: 'visible', timeout: 15_000 }),
  ]);
  if (await changeForm.isVisible()) {
    await changeForm.locator('[name="currentPassword"]').fill(initialPassword);
    await changeForm.locator('[name="newPassword"]').fill(password);
    await changeForm.locator('[name="confirmPassword"]').fill(password);
    await changeForm.locator('[type="submit"]').click();
  }
  await page.waitForSelector('.app-shell', { timeout: 15_000 });

  await page.goto(`${baseUrl}/#/upload`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#video-file', { state: 'attached', timeout: 10_000 });
  await page.locator('#video-file').setInputFiles(videoPath);
  const startedAt = await page.locator('#upload-start').inputValue();
  if (!startedAt) {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    await page.locator('#upload-start').fill(local);
  }
  await page.locator('input[name="timeConfirmed"]').check();
  await page.getByRole('button', { name: /开始上传/ }).click();

  await page.getByText('上传与分析任务创建完成', { exact: true }).waitFor({
    state: 'visible',
    timeout: 90_000,
  });

  let task = null;
  for (let index = 0; index < 40 && !task?.recordId; index += 1) {
    await page.waitForTimeout(500);
    const state = await page.evaluate(async () => {
      const response = await fetch('/api/state');
      return response.json();
    });
    task = state.tasks.find((candidate) => candidate.sha === '920b7864bc2ed6d0a006189af47613854b7f2fa630e9504fc43378615cae23ae');
  }
  assert(task, '浏览器上传后未找到分析任务');
  assert(task.status === '已完成', `分析任务未完成：${task.status} ${task.reason || ''}`);
  assert(task.recordId, '分析任务没有关联记录');

  await page.goto(`${baseUrl}/#/records/${encodeURIComponent(task.recordId)}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('.app-shell', { timeout: 10_000 });
  await page.getByText(task.recordId, { exact: false }).first().waitFor({ timeout: 10_000 });
  await page.getByText('I1-1', { exact: true }).first().waitFor({ timeout: 10_000 });
  assert(await page.getByText(/^I\d-\d$/).count() >= 9, '记录详情未显示九次读数');
  await page.locator('[data-action="frame-evidence"]').first().click();
  await page.locator('.frame-proof img').waitFor({ state: 'visible', timeout: 10_000 });
  assert(await page.locator('.frame-proof .recognized-region').count(), '识别帧未显示显示屏识别框');
  assert(await page.getByText('帧内识别文本', { exact: true }).count(), '识别帧弹窗缺少帧内识别文本');
  assert(await page.getByText('视频帧偏移', { exact: true }).count(), '识别帧弹窗缺少视频帧偏移');
  await page.locator('.modal-foot [data-modal-close]').click();
  const unexpectedErrors = errors.filter(
    (message) => !message.includes('status of 401')
  );
  assert(unexpectedErrors.length === 0, `页面异常：${unexpectedErrors.join(' | ')}`);

  console.log(JSON.stringify({
    ok: true,
    taskId: task.id,
    recordId: task.recordId,
    status: task.status,
    readoutsVisible: await page.getByText(/^I\d-\d$/).count(),
  }, null, 2));
} catch (error) {
  console.error('BODY:', (await page.locator('body').innerText()).slice(0, 6000));
  console.error('PAGE ERRORS:', errors);
  throw error;
} finally {
  await browser.close();
}
