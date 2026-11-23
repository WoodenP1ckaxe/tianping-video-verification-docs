import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightRoot = process.env.PLAYWRIGHT_NODE_MODULES
  || 'C:\\Users\\CYF\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules';
const { chromium } = require(`${playwrightRoot}\\playwright`);

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:18081';
const initialPassword = process.env.SMOKE_INITIAL_PASSWORD;
const executablePath = process.env.CHROMIUM_PATH || undefined;
if (!initialPassword) throw new Error('SMOKE_INITIAL_PASSWORD is required');
const accountPassword = {
  U001: process.env.SMOKE_INSPECTOR_PASSWORD || initialPassword,
  U003: process.env.SMOKE_VERIFIER_PASSWORD || initialPassword,
  U000: process.env.SMOKE_ADMIN_PASSWORD || initialPassword,
};

const browser = await chromium.launch({ headless: true, executablePath });
const contexts = [];
const pageErrors = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1380, height: 920 } });
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return page;
}

async function login(page, account, currentPassword, newPassword) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('form[data-form="login"]', { timeout: 15_000 });
  await page.locator('#login-account').fill(account);
  await page.locator('#login-password').fill(currentPassword);
  await page.locator('form[data-form="login"] [type="submit"]').click();
  const change = page.locator('form[data-form="change-password"]');
  await Promise.race([
    change.waitFor({ state: 'visible', timeout: 15_000 }),
    page.locator('.app-shell').waitFor({ state: 'visible', timeout: 15_000 }),
  ]);
  if (await change.isVisible()) {
    await change.locator('[name="currentPassword"]').fill(currentPassword);
    await change.locator('[name="newPassword"]').fill(newPassword);
    await change.locator('[name="confirmPassword"]').fill(newPassword);
    await change.locator('[type="submit"]').click();
  }
  await page.waitForSelector('.app-shell', { timeout: 15_000 });
}

try {
  const inspector = await newPage();
  await login(inspector, 'U001', accountPassword.U001, 'InspectorPass123');
  const state = await inspector.evaluate(async () => {
    const response = await fetch('/api/state');
    return response.json();
  });
  const pending = state.records.find((record) => (
    record.inspector === 'U001'
    && record.status === '待提交'
    && Array.isArray(record.readouts)
    && record.readouts.length === 9
    && record.box
    && record.cleanliness
    && record.level
    && record.internalCal
  ));
  assert(pending, '没有可供联调的待提交记录');

  await inspector.goto(`${baseUrl}/#/records/${encodeURIComponent(pending.id)}`);
  const lowKeys = pending.readouts
    .map((readout, index) => ({
      key: `I${Number(readout.point) + 1}-${Number(readout.idx ?? (index % 3) + 1)}`,
      conf: Number(readout.conf),
    }))
    .filter((readout) => readout.conf < 0.9)
    .map((readout) => readout.key);
  for (const key of lowKeys) {
    const response = inspector.waitForResponse((res) => (
      res.request().method() === 'POST'
      && res.url().includes(`/api/records/${pending.id}/check/`)
    ));
    await inspector.locator(`[data-action="check-readout"][data-key="${key}"]`).click();
    await response;
    await inspector.waitForTimeout(150);
  }
  for (const field of ['cleanliness', 'level', 'internalCal']) {
    if (Number(pending.speech?.[field]?.conf) >= 0.9) continue;
    const response = inspector.waitForResponse((res) => (
      res.request().method() === 'PATCH'
      && res.url().includes(`/api/records/${pending.id}`)
    ));
    const select = inspector.locator(`.record-field[data-field="${field}"]`);
    const current = await select.inputValue();
    await select.selectOption(current === '是' ? '否' : '是');
    await response;
    await inspector.waitForTimeout(150);
  }
  await inspector.getByRole('button', { name: /一键提交/ }).click();
  await inspector.locator('#modal-form').waitFor({ state: 'visible' });
  await inspector.getByRole('button', { name: '确认提交', exact: true }).click();
  await inspector.waitForFunction(async (id) => {
    const response = await fetch(`/api/records/${encodeURIComponent(id)}`);
    if (!response.ok) return false;
    const body = await response.json();
    return body.record?.status === '已提交';
  }, pending.id, { timeout: 10_000 });

  const verifier = await newPage();
  await login(verifier, 'U003', accountPassword.U003, 'VerifierPass123');
  await verifier.goto(`${baseUrl}/#/records/${encodeURIComponent(pending.id)}`);
  await verifier.getByRole('button', { name: /电子签名确认/ }).click();
  await verifier.locator('#modal-form').waitFor({ state: 'visible' });
  await verifier.getByRole('button', { name: '确认并签名', exact: true }).click();
  await verifier.getByText('复核确认完成，记录已锁定', { exact: true }).waitFor({ timeout: 10_000 });
  const verifiedState = await verifier.evaluate(async (id) => {
    const response = await fetch(`/api/records/${encodeURIComponent(id)}`);
    return response.json();
  }, pending.id);
  assert(verifiedState.record?.status === '已复核确认', '复核确认后状态未锁定');

  const admin = await newPage();
  await login(admin, 'U000', accountPassword.U000, 'AdminPass123');
  for (const route of ['/masterdata', '/template', '/accounts', '/audit', '/system']) {
    await admin.goto(`${baseUrl}/#${route}`);
    await admin.waitForSelector('.app-shell', { timeout: 10_000 });
    await admin.waitForTimeout(250);
    assert(await admin.locator('.content').count(), `${route} 未渲染内容`);
    assert(!(await admin.getByText('页面不存在', { exact: true }).count()), `${route} 路由不存在`);
  }

  assert(pageErrors.length === 0, `页面异常：${pageErrors.join(' | ')}`);
  console.log(JSON.stringify({
    ok: true,
    recordId: pending.id,
    verifiedStatus: verifiedState.record.status,
    adminRoutes: ['/masterdata', '/template', '/accounts', '/audit', '/system'],
    pageErrors,
  }, null, 2));
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
}
