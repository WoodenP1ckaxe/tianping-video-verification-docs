import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightRoot = process.env.PLAYWRIGHT_NODE_MODULES
  || 'C:\\Users\\CYF\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules';
const { chromium } = require(`${playwrightRoot}\\playwright`);

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:18081';
const initialPassword = process.env.SMOKE_INITIAL_PASSWORD;
const newPassword = process.env.SMOKE_NEW_PASSWORD || 'UiCheck1234';

if (!initialPassword) {
  throw new Error('SMOKE_INITIAL_PASSWORD is required');
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const errorResponses = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`);
});
page.on('response', (response) => {
  if (response.status() >= 400) errorResponses.push(`${response.status()} ${response.url()}`);
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('form[data-form="login"]', { timeout: 15_000 });
  assert(await page.locator('h1').count(), '登录页缺少主标题');
  assert(await page.getByText('天平校验视频分析系统', { exact: true }).count(), '登录页品牌缺失');

  await page.locator('#login-account').fill('U002');
  await page.locator('#login-password').fill(initialPassword);
  await page.locator('form[data-form="login"] [type="submit"]').click();

  const changeForm = page.locator('form[data-form="change-password"]');
  await Promise.race([
    changeForm.waitFor({ state: 'visible', timeout: 15_000 }),
    page.locator('.app-shell').waitFor({ state: 'visible', timeout: 15_000 }),
  ]);

  if (await changeForm.isVisible()) {
    await changeForm.locator('[name="currentPassword"]').fill(initialPassword);
    await changeForm.locator('[name="newPassword"]').fill(newPassword);
    await changeForm.locator('[name="confirmPassword"]').fill(newPassword);
    await changeForm.locator('[type="submit"]').click();
  }

  await page.waitForSelector('.app-shell', { timeout: 15_000 });
  assert(await page.getByText('工作台', { exact: true }).count(), '登录后未进入工作台');

  for (const route of ['/records', '/tasks', '/export', '/dashboard']) {
    await page.goto(`${baseUrl}/#${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app-shell', { timeout: 10_000 });
    await page.waitForTimeout(350);
    assert(!(await page.locator('.boot-screen').count()), `${route} 仍停留在启动页`);
    assert(await page.locator('.content').count(), `${route} 未渲染主内容`);
  }

  await page.goto(`${baseUrl}/#/records`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app-shell', { timeout: 10_000 });
  const recordRows = await page.locator('tbody tr').count();
  assert(recordRows > 0, '记录查询页没有服务端数据行');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/#/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app-shell', { timeout: 10_000 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - window.innerWidth
  ));
  assert(overflow <= 2, `移动端页面横向溢出 ${overflow}px`);

  assert(pageErrors.length === 0, `页面异常：${pageErrors.join(' | ')}`);
  const unexpectedConsoleErrors = consoleErrors.filter(
    (message) => !message.includes('Failed to load resource: the server responded with a status of 401')
  );
  assert(unexpectedConsoleErrors.length === 0, `控制台错误：${unexpectedConsoleErrors.join(' | ')}`);
  const unexpectedResponses = errorResponses.filter(
    (line) => !line.startsWith('401 ') && !line.endsWith('/favicon.ico')
  );
  assert(unexpectedResponses.length === 0, `异常 HTTP 响应：${unexpectedResponses.join(' | ')}`);
  assert(failedRequests.length === 0, `网络请求失败：${failedRequests.join(' | ')}`);

  console.log(JSON.stringify({
    ok: true,
    routes: ['/dashboard', '/tasks', '/records', '/export'],
    recordRows,
    mobileOverflowPx: overflow,
    consoleErrors,
    errorResponses,
    pageErrors,
    failedRequests,
  }, null, 2));
} finally {
  await browser.close();
}
