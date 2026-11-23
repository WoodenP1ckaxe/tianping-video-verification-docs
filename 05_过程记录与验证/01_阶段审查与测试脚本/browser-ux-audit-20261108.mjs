import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightRoot = process.env.PLAYWRIGHT_NODE_MODULES
  || 'C:\\Users\\CYF\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules';
const { chromium } = require(`${playwrightRoot}\\playwright`);
const baseUrl = process.env.SMOKE_BASE_URL;
const initialPassword = process.env.SMOKE_INITIAL_PASSWORD;
if (!baseUrl) throw new Error('SMOKE_BASE_URL is required');
if (!initialPassword) throw new Error('SMOKE_INITIAL_PASSWORD is required');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined
});
const contexts = [];
const observations = {
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  httpErrors: [],
  routes: {},
  accessibility: {},
  externalOrigins: new Set()
};

async function newPage(viewport = { width: 1440, height: 960 }) {
  const context = await browser.newContext({ viewport });
  contexts.push(context);
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') observations.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => observations.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    observations.failedRequests.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      observations.httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(baseUrl).origin
      && !['data:', 'blob:'].includes(url.protocol)) {
      observations.externalOrigins.add(url.origin);
    }
  });
  return page;
}

async function login(page, account, changedPassword) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('form[data-form="login"]', { timeout: 15_000 });
  await page.locator('#login-account').fill(account);
  await page.locator('#login-password').fill(initialPassword);
  await page.locator('form[data-form="login"] [type="submit"]').click();
  const change = page.locator('form[data-form="change-password"]');
  await Promise.race([
    change.waitFor({ state: 'visible', timeout: 15_000 }),
    page.locator('.app-shell').waitFor({ state: 'visible', timeout: 15_000 })
  ]);
  if (await change.isVisible()) {
    await change.locator('[name="currentPassword"]').fill(initialPassword);
    await change.locator('[name="newPassword"]').fill(changedPassword);
    await change.locator('[name="confirmPassword"]').fill(changedPassword);
    await change.locator('[type="submit"]').click();
  }
  await page.waitForSelector('.app-shell', { timeout: 15_000 });
}

async function auditRoute(page, route) {
  await page.goto(`${baseUrl}/#${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app-shell', { timeout: 10_000 });
  await page.waitForTimeout(250);
  assert(await page.locator('.content').count(), `${route} 未渲染主内容`);
  assert(!(await page.locator('.boot-screen').count()), `${route} 停留在启动页`);
  const metrics = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden'
        && style.display !== 'none'
        && rect.width > 0
        && rect.height > 0;
    };
    const accessibleName = (element) => (
      element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.labels?.[0]?.innerText
      || element.closest('label')?.innerText
      || element.innerText
      || element.value
      || ''
    ).trim();
    const controls = [...document.querySelectorAll('input, select, textarea')]
      .filter((element) => visible(element) && element.type !== 'hidden');
    const buttons = [...document.querySelectorAll('button, [role="button"]')]
      .filter(visible);
    const images = [...document.querySelectorAll('img')].filter(visible);
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    return {
      title: document.title,
      lang: document.documentElement.lang,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      controls: controls.length,
      unlabeledControls: controls
        .filter((element) => !accessibleName(element))
        .map((element) => element.outerHTML.slice(0, 180)),
      buttons: buttons.length,
      unnamedButtons: buttons
        .filter((element) => !accessibleName(element))
        .map((element) => element.outerHTML.slice(0, 180)),
      images: images.length,
      imagesWithoutAlt: images
        .filter((element) => element.getAttribute('alt') === null)
        .map((element) => element.outerHTML.slice(0, 180)),
      duplicateIds: [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))],
      headings: [...document.querySelectorAll('h1, h2, h3')].map((heading) => ({
        level: heading.tagName,
        text: heading.innerText.trim().slice(0, 120)
      }))
    };
  });
  observations.routes[`${page.url().split('/').at(-1) || route}:${route}`] = metrics;
  return metrics;
}

try {
  const inspector = await newPage();
  await login(inspector, 'U001', 'UxInspector1234');
  const inspectorRoutes = [
    '/dashboard',
    '/records',
    '/records?draft=1',
    '/records/20260926-F001-03',
    '/history/F001',
    '/upload',
    '/tasks',
    '/notifications',
    '/devices',
    '/qr',
    '/help',
    '/export'
  ];
  for (const route of inspectorRoutes) await auditRoute(inspector, route);

  await auditRoute(inspector, '/accounts');
  assert(await inspector.getByText('无权访问', { exact: true }).count(),
    '检验人员直接访问账号页没有显示无权访问');

  const accessibility = Object.values(observations.routes);
  const accessibilityIssues = {
    desktopOverflow: accessibility
      .filter((route) => route.horizontalOverflow > 2)
      .map((route) => ({ title: route.title, overflow: route.horizontalOverflow })),
    unlabeledControls: accessibility
      .flatMap((route) => route.unlabeledControls.map((element) => ({
        title: route.title,
        element
      }))),
    unnamedButtons: accessibility
      .flatMap((route) => route.unnamedButtons.map((element) => ({
        title: route.title,
        element
      }))),
    imagesWithoutAlt: accessibility
      .flatMap((route) => route.imagesWithoutAlt.map((element) => ({
        title: route.title,
        element
      })))
  };

  await inspector.setViewportSize({ width: 390, height: 844 });
  const mobile = {};
  const mobileOverflowIssues = [];
  for (const route of inspectorRoutes) {
    mobile[route] = await auditRoute(inspector, route);
    if (mobile[route].horizontalOverflow > 2) {
      mobileOverflowIssues.push({
        route,
        overflow: mobile[route].horizontalOverflow
      });
    }
  }

  await inspector.setViewportSize({ width: 768, height: 1024 });
  const tabletOverflowIssues = [];
  for (const route of ['/dashboard', '/records', '/upload', '/export']) {
    const result = await auditRoute(inspector, route);
    if (result.horizontalOverflow > 2) {
      tabletOverflowIssues.push({
        route,
        overflow: result.horizontalOverflow
      });
    }
  }

  const verifier = await newPage();
  await login(verifier, 'U003', 'UxVerifier1234');
  for (const route of [
    '/dashboard', '/records', '/verify', '/masterdata', '/template',
    '/qr', '/help', '/export', '/notifications'
  ]) {
    await auditRoute(verifier, route);
  }
  await auditRoute(verifier, '/upload');
  assert(await verifier.getByText('无权访问', { exact: true }).count(),
    '复核人员直接访问上传页没有显示无权访问');

  const admin = await newPage();
  await login(admin, 'U000', 'UxAdmin1234');
  for (const route of [
    '/dashboard', '/tasks', '/records', '/masterdata', '/template',
    '/accounts', '/audit', '/system', '/help', '/export',
    '/notifications'
  ]) {
    await auditRoute(admin, route);
  }

  const loginPage = await newPage();
  await loginPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await loginPage.waitForSelector('#login-account');
  await loginPage.keyboard.press('Tab');
  const firstFocus = await loginPage.evaluate(() => ({
    id: document.activeElement?.id,
    tag: document.activeElement?.tagName
  }));
  assert(firstFocus.tag === 'A' || firstFocus.tag === 'BUTTON' || firstFocus.id,
    '登录页键盘焦点没有进入可识别控件');

  const unexpectedConsole = observations.consoleErrors.filter(
    (message) => !message.includes('status of 401')
  );
  const unexpectedHttp = observations.httpErrors.filter(
    (line) => !line.startsWith('401 ')
  );
  const runtimeIssues = {
    pageErrors: observations.pageErrors,
    failedRequests: observations.failedRequests,
    consoleErrors: unexpectedConsole,
    httpErrors: unexpectedHttp,
    externalOrigins: [...observations.externalOrigins]
  };
  const issues = {
    accessibility: accessibilityIssues,
    mobileOverflow: mobileOverflowIssues,
    tabletOverflow: tabletOverflowIssues,
    runtime: runtimeIssues
  };

  console.log(JSON.stringify({
    ok: !Object.values(issues).some((value) => (
      Array.isArray(value) ? value.length : Object.values(value).some((items) =>
        Array.isArray(items) && items.length)
    )),
    checkedRoutes: Object.keys(observations.routes),
    mobileOverflow: Object.fromEntries(
      Object.entries(mobile).map(([route, value]) => [
        route,
        value.horizontalOverflow
      ])
    ),
    firstFocus,
    externalOrigins: [...observations.externalOrigins],
    consoleErrors: observations.consoleErrors,
    pageErrors: observations.pageErrors,
    failedRequests: observations.failedRequests,
    httpErrors: observations.httpErrors,
    accessibilityIssues,
    mobileOverflowIssues,
    tabletOverflowIssues
  }, null, 2));
  if (!Object.values(issues).some((value) => (
    Array.isArray(value) ? value.length : Object.values(value).some((items) =>
      Array.isArray(items) && items.length)
  ))) {
    process.exitCode = 0;
  } else {
    process.exitCode = 1;
  }
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
}
