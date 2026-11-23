import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const baseUrl = process.env.REMOTE_BASE_URL;
const account = process.env.REMOTE_ACCOUNT || 'U000';
const password = process.env.REMOTE_PASSWORD;
const recordId = process.env.REMOTE_RECORD_ID || '20260926-F001-03';
const outputDir = join(import.meta.dirname, 'output');
assert.ok(baseUrl, 'REMOTE_BASE_URL is required');
assert.ok(password, 'REMOTE_PASSWORD is required');
mkdirSync(outputDir, { recursive: true });

function cookieFrom(response) {
  return (response.headers.get('set-cookie') || '').split(';', 1)[0];
}

let cookie = '';
let csrf = '';
async function request(path, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    ...(cookie ? { Cookie: cookie } : {}),
    ...(csrf && !['GET', 'HEAD'].includes(method)
      ? { 'X-CSRF-Token': csrf }
      : {}),
    ...(options.headers || {}),
  };
  let body = options.body;
  if (body !== undefined && typeof body !== 'string' && !Buffer.isBuffer(body)) {
    body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = cookieFrom(response);
  return response;
}

async function json(path, options, expected = 200) {
  const response = await request(path, options);
  const payload = await response.json();
  assert.equal(response.status, expected, `${options?.method || 'GET'} ${path}: `
    + `${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

const login = await json('/api/auth/login', {
  method: 'POST',
  body: { account, password },
});
csrf = login.csrfToken;
assert.equal(login.user.mustChangePassword, false);

const results = {};
for (const [name, path, body] of [
  ['recordPdf', `/api/exports/record/${recordId}`, {}],
  ['batchPdf', '/api/exports/records', {
    devices: ['F001'],
    from: '2026-09-01',
    to: '2026-11-30',
    includeUnverified: true,
  }],
  ['weekPdf', '/api/exports/week', {
    device: 'F001',
    week: '2026-W39',
  }],
  ['recordsCsv', '/api/exports/csv', {
    type: 'records',
    from: '2026-09-01',
    to: '2026-11-30',
  }],
]) {
  const started = performance.now();
  const response = await request(path, { method: 'POST', body });
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200, `${name}: ${response.status} ${bytes.toString()}`);
  assert.ok(bytes.length > 100, `${name}: response too small`);
  results[name] = {
    bytes: bytes.length,
    elapsedMs: Math.round(performance.now() - started),
    contentType: response.headers.get('content-type'),
    disposition: response.headers.get('content-disposition'),
  };
  if (name.endsWith('Pdf')) {
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    writeFileSync(join(outputDir, `${name}.pdf`), bytes);
  } else {
    assert.ok(bytes.toString('utf8').includes('记录编号'));
    writeFileSync(join(outputDir, `${name}.csv`), bytes);
  }
}

const previewStarted = performance.now();
const preview = await request(`/api/previews/record/${recordId}.png`);
const previewBytes = Buffer.from(await preview.arrayBuffer());
assert.equal(preview.status, 200);
assert.equal(previewBytes.subarray(1, 4).toString(), 'PNG');
assert.ok(previewBytes.length > 10_000);
writeFileSync(join(outputDir, 'record-preview.png'), previewBytes);
results.preview = {
  bytes: previewBytes.length,
  elapsedMs: Math.round(performance.now() - previewStarted),
  contentType: preview.headers.get('content-type'),
};

const audit = await json(`/api/audit?page=1&pageSize=20`);
assert.ok(audit.items.some((item) => item.type === '导出'));

console.log(JSON.stringify({
  ok: true,
  account,
  recordId,
  outputDir,
  results,
  latestExportAudit: audit.items.find((item) => item.type === '导出'),
}, null, 2));
