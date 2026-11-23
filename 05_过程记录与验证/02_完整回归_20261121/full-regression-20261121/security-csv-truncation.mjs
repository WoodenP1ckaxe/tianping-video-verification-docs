import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../server.js';

function cookieFrom(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return values[0]?.split(';', 1)[0] || '';
}

class Client {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookie = '';
    this.csrf = '';
  }

  async request(path, options = {}) {
    const method = options.method || 'GET';
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const headers = {
      ...(this.cookie ? { Cookie: this.cookie } : {}),
      ...(this.csrf && mutating ? { 'X-CSRF-Token': this.csrf } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    };
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = cookieFrom(response);
    return response;
  }

  async loginAndChange(initialPassword, newPassword) {
    const login = await this.request('/api/auth/login', {
      method: 'POST',
      body: { account: 'U000', password: initialPassword }
    });
    assert.equal(login.status, 200);
    this.csrf = (await login.json()).csrfToken;
    const changed = await this.request('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: initialPassword, newPassword }
    });
    assert.equal(changed.status, 200);
  }
}

const dataDir = mkdtempSync(join(tmpdir(), 'tianping-csv-limit-'));
const app = await startServer({
  port: 0,
  host: '127.0.0.1',
  dataDir,
  initialPassword: 'CsvTest1234',
  workerIntervalMs: 600_000
});

try {
  const baseUrl = `http://127.0.0.1:${app.address.port}`;
  const client = new Client(baseUrl);
  await client.loginAndChange('CsvTest1234', 'CsvAdmin1234');

  const source = app.db.prepare(
    "SELECT id FROM records WHERE status <> '已作废' ORDER BY id LIMIT 1"
  ).get();
  assert.ok(source, 'seeded record missing');
  const columns = app.db.prepare('PRAGMA table_info(records)').all().map((row) => row.name);
  const fields = columns.filter((column) => column !== 'id');
  const selected = fields.map((field) => field === 'task_id' ? 'NULL' : field);
  const insert = app.db.prepare(`
    INSERT INTO records (id, ${fields.join(',')})
    SELECT ?, ${selected.join(',')}
    FROM records
    WHERE id = ?
  `);
  const current = app.db.prepare('SELECT COUNT(*) AS count FROM records').get().count;
  app.db.exec('BEGIN IMMEDIATE');
  for (let index = current; index < 5005; index += 1) {
    insert.run(`CSV-${String(index).padStart(5, '0')}`, source.id);
  }
  app.db.exec('COMMIT');

  const list = await client.request('/api/records?page=1&pageSize=1');
  const listBody = await list.json();
  const exportResponse = await client.request('/api/exports/csv', {
    method: 'POST',
    body: {
      type: 'records',
      from: '2000-01-01',
      to: '2099-12-31'
    }
  });
  const csv = await exportResponse.text();
  const exportedRows = csv.split('\r\n').length - 1;
  const readoutExportResponse = await client.request('/api/exports/csv', {
    method: 'POST',
    body: {
      type: 'readouts',
      from: '2000-01-01',
      to: '2099-12-31'
    }
  });
  const readoutCsv = await readoutExportResponse.text();
  const exportedReadoutRows = readoutCsv.split('\r\n').length - 1;

  app.db.prepare(`
    INSERT INTO tasks (
      id, file_name, file_path, size_bytes, user_id, status,
      started_at, queued_at, created_at, updated_at
    ) VALUES (
      'T-PUBLIC-HEALTH-PROBE',
      'SENSITIVE-CUSTOMER-CALIBRATION.mp4',
      ?,
      16,
      'U001',
      '排队中',
      '2026-11-21 18:30',
      '2026-11-21 18:30',
      '2026-11-21 18:30',
      '2026-11-21 18:30'
    )
  `).run(join(dataDir, 'videos', 'missing.mp4'));
  const healthResponse = await fetch(`${baseUrl}/healthz`);
  const health = await healthResponse.json();

  const beforeSetting = app.db.prepare(
    "SELECT value_json FROM settings WHERE key = 'capacityWarnPercent'"
  ).get()?.value_json;
  const partialSettings = await client.request('/api/system/settings', {
    method: 'PATCH',
    body: {
      capacityWarnPercent: 77,
      confidenceThreshold: 9
    }
  });
  const partialSettingsBody = await partialSettings.json();
  const afterSetting = app.db.prepare(
    "SELECT value_json FROM settings WHERE key = 'capacityWarnPercent'"
  ).get()?.value_json;
  console.log(JSON.stringify({
    totalRecords: listBody.total,
    exportedRows,
    truncated: exportedRows < listBody.total,
    missingRows: Math.max(0, listBody.total - exportedRows),
    exportedReadoutRows,
    expectedReadoutRows: listBody.total * 9,
    readoutsTruncated: exportedReadoutRows < listBody.total * 9,
    unauthenticatedHealthQueue: health.queue,
    partialSettingsUpdate: {
      status: partialSettings.status,
      code: partialSettingsBody.error?.code,
      before: beforeSetting,
      after: afterSetting,
      appliedDespiteError: beforeSetting !== afterSetting
    }
  }, null, 2));
} finally {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}
