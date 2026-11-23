import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const playwrightRoot = process.env.PLAYWRIGHT_NODE_MODULES
  || 'C:\\Users\\CYF\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules';
const { chromium } = require(`${playwrightRoot}\\playwright`);

const baseUrl = process.env.REMOTE_BASE_URL;
const initialPassword = process.env.REMOTE_INITIAL_PASSWORD;
const changedPassword = process.env.REMOTE_CHANGED_PASSWORD;
const videoPath = resolve(
  process.env.REMOTE_VIDEO_PATH
    || '../synthetic-samples/synthetic-single-F001-U001.mp4',
);

assert.ok(baseUrl, 'REMOTE_BASE_URL is required');
assert.ok(initialPassword, 'REMOTE_INITIAL_PASSWORD is required');
assert.ok(changedPassword, 'REMOTE_CHANGED_PASSWORD is required');

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`);
});

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-account').fill('U001');
  await page.locator('#login-password').fill(initialPassword);
  await page.locator('form[data-form="login"] [type="submit"]').click();
  const change = page.locator('form[data-form="change-password"]');
  await Promise.race([
    change.waitFor({ state: 'visible', timeout: 20_000 }),
    page.locator('.app-shell').waitFor({ state: 'visible', timeout: 20_000 }),
  ]);
  if (await change.isVisible()) {
    await change.locator('[name="currentPassword"]').fill(initialPassword);
    await change.locator('[name="newPassword"]').fill(changedPassword);
    await change.locator('[name="confirmPassword"]').fill(changedPassword);
    await change.locator('[type="submit"]').click();
  }
  await page.waitForSelector('.app-shell', { timeout: 20_000 });

  await page.goto(`${baseUrl}/#/upload`, { waitUntil: 'domcontentloaded' });
  await page.locator('#video-file').waitFor({ state: 'attached', timeout: 15_000 });
  await page.locator('#video-file').setInputFiles(videoPath);
  const confirmed = page.locator('input[name="timeConfirmed"]');
  if (!(await confirmed.isChecked())) await confirmed.check();
  const uploadStarted = performance.now();
  await page.getByRole('button', { name: /开始上传/ }).click();
  await page.getByText('上传与分析任务创建完成', { exact: true }).waitFor({
    state: 'visible',
    timeout: 180_000,
  });
  const uploadFinished = performance.now();

  const sourceFile = basename(videoPath);
  let task;
  const deadline = performance.now() + 20 * 60_000;
  let lastStatus = '';
  while (performance.now() < deadline) {
    const state = await page.evaluate(async () => {
      const response = await fetch('/api/state');
      if (!response.ok) throw new Error(`state ${response.status}`);
      return response.json();
    });
    task = state.tasks
      .filter((candidate) => candidate.file === sourceFile)
      .sort((left, right) => String(right.queuedAt).localeCompare(String(left.queuedAt)))[0];
    if (task?.status !== lastStatus) {
      lastStatus = task?.status || '';
      console.log(`status=${lastStatus} task=${task?.id || ''}`);
    }
    if (task && ['已完成', '失败', '待人工处理'].includes(task.status)) break;
    await page.waitForTimeout(1_000);
  }
  const analysisFinished = performance.now();
  assert.ok(task, `未找到 ${sourceFile} 上传任务`);
  assert.equal(task.status, '已完成', `${task.status}: ${task.reason || ''}`);
  assert.ok(task.recordId, '任务未生成记录');

  const detail = await page.evaluate(async (recordId) => {
    const response = await fetch(`/api/records/${encodeURIComponent(recordId)}`);
    if (!response.ok) throw new Error(`record ${response.status}`);
    return response.json();
  }, task.recordId);
  assert.equal(detail.record.readouts.length, 9);
  assert.ok(detail.record.readouts.every((readout) => readout.screenshot));
  assert.ok(detail.record.readouts.every((readout) => readout.frame?.marked));
  assert.equal(detail.record.personCard?.account, 'U001');
  assert.equal(detail.record.deviceCard?.code, 'F001');
  assert.equal(detail.record.speech?.engine, 'whisper.cpp');
  assert.ok([
    'completed',
    'partial',
    'no-speech',
    'no-audio',
    'unavailable',
    'failed',
  ].includes(detail.record.speech?.state));

  await page.goto(`${baseUrl}/#/records/${encodeURIComponent(task.recordId)}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('.app-shell', { timeout: 20_000 });
  await page.getByText(task.recordId, { exact: false }).first().waitFor({
    timeout: 20_000,
  });
  assert.ok((await page.getByText(/^I\d-\d$/).count()) >= 9);
  assert.ok((await page.getByText('真实称重段时序', { exact: true }).count()) > 0);
  const evidence = page.locator('[data-action="frame-evidence"]').first();
  await evidence.click();
  await page.locator('.frame-proof img').waitFor({ state: 'visible', timeout: 15_000 });
  assert.ok((await page.locator('.frame-proof .recognized-region').count()) > 0);
  await page.locator('.modal-foot [data-modal-close]').click();

  const health = await page.evaluate(async () => {
    const response = await fetch('/healthz');
    return { status: response.status, body: await response.json() };
  });
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.body.analyzer.speech.available, true);

  const unexpectedConsole = consoleErrors.filter(
    (message) => !message.includes('status of 401'),
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(unexpectedConsole, []);

  console.log(JSON.stringify({
    ok: true,
    taskId: task.id,
    recordId: task.recordId,
    sourceFile,
    uploadMs: Math.round(uploadFinished - uploadStarted),
    analysisWallMs: Math.round(analysisFinished - uploadFinished),
    taskDurationMs: task.durationMs,
    speech: detail.record.speech,
    readouts: detail.record.readouts.length,
    health: {
      status: health.status,
      asrAvailable: health.body.analyzer.speech.available,
      fontAvailable: health.body.pdf.fontAvailable,
      previewAvailable: health.body.pdf.previewAvailable,
    },
    consoleErrors,
  }, null, 2));
} catch (error) {
  console.error('BODY:', (await page.locator('body').innerText()).slice(0, 10_000));
  console.error('PAGE_ERRORS:', pageErrors);
  console.error('CONSOLE_ERRORS:', consoleErrors);
  console.error('FAILED_REQUESTS:', failedRequests);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
