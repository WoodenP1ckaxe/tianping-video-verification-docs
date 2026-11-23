import { createRequire } from 'node:module';
import { basename } from 'node:path';

const require = createRequire(import.meta.url);
const playwrightRoot = process.env.PLAYWRIGHT_NODE_MODULES
  || 'C:\\Users\\CYF\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules';
const { chromium } = require(`${playwrightRoot}\\playwright`);

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:18084';
const initialPassword = process.env.SMOKE_INITIAL_PASSWORD;
const videoPath = process.env.SMOKE_VIDEO_PATH;
if (!initialPassword) throw new Error('SMOKE_INITIAL_PASSWORD is required');
if (!videoPath) throw new Error('SMOKE_VIDEO_PATH is required');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined
});
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
const errorResponses = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`);
});
page.on('response', (response) => {
  if (response.status() >= 400) {
    errorResponses.push(`${response.status()} ${response.url()}`);
  }
});

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('form[data-form="login"]', { timeout: 15_000 });
  await page.locator('#login-account').fill('U001');
  await page.locator('#login-password').fill(initialPassword);
  await page.locator('form[data-form="login"] [type="submit"]').click();
  const changeForm = page.locator('form[data-form="change-password"]');
  await Promise.race([
    changeForm.waitFor({ state: 'visible', timeout: 15_000 }),
    page.locator('.app-shell').waitFor({ state: 'visible', timeout: 15_000 })
  ]);
  if (await changeForm.isVisible()) {
    await changeForm.locator('[name="currentPassword"]').fill(initialPassword);
    await changeForm.locator('[name="newPassword"]').fill('UiUpload1234');
    await changeForm.locator('[name="confirmPassword"]').fill('UiUpload1234');
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
  const confirmed = page.locator('input[name="timeConfirmed"]');
  if (!(await confirmed.isChecked())) await confirmed.check();
  await page.getByRole('button', { name: /开始上传/ }).click();
  await page.getByText('上传与分析任务创建完成', { exact: true }).waitFor({
    state: 'visible',
    timeout: 90_000
  });

  const sourceFile = basename(videoPath);
  let task = null;
  for (let index = 0; index < 90; index += 1) {
    const state = await page.evaluate(async () => {
      const response = await fetch('/api/state');
      return response.json();
    });
    task = state.tasks
      .filter((candidate) => candidate.file === sourceFile)
      .sort((left, right) => String(right.queuedAt).localeCompare(String(left.queuedAt)))[0];
    if (task && ['已完成', '失败', '待人工处理'].includes(task.status)) break;
    await page.waitForTimeout(500);
  }
  assert(task, `未找到 ${sourceFile} 的上传任务`);
  assert(task.status === '已完成', `任务状态 ${task.status}：${task.reason || ''}`);
  assert(task.recordId, '任务未生成记录');

  await page.goto(`${baseUrl}/#/records/${encodeURIComponent(task.recordId)}`, {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForSelector('.app-shell', { timeout: 10_000 });
  await page.getByText(task.recordId, { exact: false }).first().waitFor({
    timeout: 10_000
  });
  assert(await page.getByText(/^I\d-\d$/).count() >= 9,
    '详情页未显示九项读数');
  assert(await page.getByText('真实称重段时序', { exact: true }).count(),
    '详情页未显示真实称重时序');
  const evidence = page.locator('[data-action="frame-evidence"]').first();
  assert(await evidence.count(), '详情页没有识别帧入口');
  await evidence.click();
  await page.locator('.frame-proof img').waitFor({ state: 'visible', timeout: 10_000 });
  assert(await page.locator('.frame-proof .recognized-region').count(),
    '识别帧未显示显示屏识别框');
  await page.locator('.modal-foot [data-modal-close]').click();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app-shell', { timeout: 10_000 });
  await page.getByText(task.recordId, { exact: false }).first().waitFor({
    timeout: 10_000
  });

  const unexpectedConsoleErrors = consoleErrors.filter(
    (message) => !message.includes('status of 401')
  );
  const unexpectedResponses = errorResponses.filter(
    (line) => !line.startsWith('401 ')
  );
  assert(pageErrors.length === 0, `pageerror：${pageErrors.join(' | ')}`);
  assert(unexpectedConsoleErrors.length === 0,
    `console error：${unexpectedConsoleErrors.join(' | ')}`);
  assert(failedRequests.length === 0,
    `失败请求：${failedRequests.join(' | ')}`);
  assert(unexpectedResponses.length === 0,
    `异常响应：${unexpectedResponses.join(' | ')}`);

  console.log(JSON.stringify({
    ok: true,
    taskId: task.id,
    recordId: task.recordId,
    status: task.status,
    sourceFile,
    readoutsVisible: await page.getByText(/^I\d-\d$/).count(),
    pageErrors,
    consoleErrors,
    failedRequests,
    errorResponses
  }, null, 2));
} catch (error) {
  console.error('BODY:', (await page.locator('body').innerText()).slice(0, 8000));
  console.error('PAGE ERRORS:', pageErrors);
  console.error('CONSOLE ERRORS:', consoleErrors);
  console.error('FAILED REQUESTS:', failedRequests);
  console.error('ERROR RESPONSES:', errorResponses);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
