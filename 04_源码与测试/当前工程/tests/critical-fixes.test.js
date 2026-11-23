import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startServer } from '../server.js';

const root = resolve(import.meta.dirname, '..');

function cookieFrom(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return values[0]?.split(';', 1)[0] || '';
}

async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const port = server.address().port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

class Client {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookie = '';
    this.csrf = '';
  }

  async request(path, options = {}) {
    const method = options.method || 'GET';
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(this.csrf && !['GET', 'HEAD'].includes(method)
          ? { 'X-CSRF-Token': this.csrf }
          : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = cookieFrom(response);
    return response;
  }

  async json(path, options = {}, expected = 200) {
    const response = await this.request(path, options);
    const payload = await response.json();
    assert.equal(
      response.status,
      expected,
      `${options.method || 'GET'} ${path}: ${response.status} ${JSON.stringify(payload)}`
    );
    return payload;
  }
}

function seedRecords(db, target = 5005) {
  const current = db.prepare('SELECT COUNT(*) count FROM records').get().count;
  const source = db.prepare(
    "SELECT id FROM records WHERE status <> '已作废' ORDER BY id LIMIT 1"
  ).get();
  assert.ok(source);
  const columns = db.prepare('PRAGMA table_info(records)').all().map((row) => row.name);
  const fields = columns.filter((column) => column !== 'id');
  const selected = fields.map((field) => field === 'task_id' ? 'NULL' : field);
  const insert = db.prepare(`
    INSERT INTO records (id, ${fields.join(',')})
    SELECT ?, ${selected.join(',')}
    FROM records
    WHERE id = ?
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (let index = current; index < target; index += 1) {
      insert.run(`CSV-${String(index).padStart(5, '0')}`, source.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return db.prepare('SELECT COUNT(*) count FROM records').get().count;
}

function csvLines(buffer) {
  return buffer.toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split(/\r?\n/);
}

test('高优先级 API 修复：全量 CSV、最小健康披露、设置回滚', {
  timeout: 90_000
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), 'tianping-critical-fixes-'));
  const app = await startServer({
    port: await freePort(),
    host: '127.0.0.1',
    dataDir: temporary,
    initialPassword: 'Tp123456',
    workerIntervalMs: 600_000
  });
  t.after(async () => {
    await app.close();
    rmSync(temporary, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${app.address.port}`;
  const admin = new Client(baseUrl);
  const login = await admin.json('/api/auth/login', {
    method: 'POST',
    body: { account: 'U000', password: 'Tp123456' }
  });
  admin.csrf = login.csrfToken;
  await admin.json('/api/auth/change-password', {
    method: 'POST',
    body: {
      currentPassword: 'Tp123456',
      newPassword: 'CriticalAdmin1234'
    }
  });

  const total = seedRecords(app.db);
  assert.equal(total, 5005);
  const exportBody = {
    from: '2000-01-01',
    to: '2099-12-31'
  };
  const recordsResponse = await admin.request('/api/exports/csv', {
    method: 'POST',
    body: { ...exportBody, type: 'records' }
  });
  assert.equal(recordsResponse.status, 200);
  const recordLines = csvLines(Buffer.from(await recordsResponse.arrayBuffer()));
  assert.equal(recordLines.length - 1, total);

  const readoutsResponse = await admin.request('/api/exports/csv', {
    method: 'POST',
    body: { ...exportBody, type: 'readouts' }
  });
  assert.equal(readoutsResponse.status, 200);
  const readoutLines = csvLines(Buffer.from(await readoutsResponse.arrayBuffer()));
  assert.equal(readoutLines.length - 1, total * 9);

  app.db.prepare(`
    INSERT INTO tasks (
      id, file_name, file_path, size_bytes, user_id, status,
      started_at, queued_at, created_at, updated_at
    ) VALUES (
      'T-PRIVATE-HEALTH', 'SENSITIVE-CUSTOMER-CALIBRATION.mp4', ?, 16,
      'U001', '排队中', '2026-11-22 20:00', '2026-11-22 20:00',
      '2026-11-22 20:00', '2026-11-22 20:00'
    )
  `).run(join(temporary, 'videos', 'missing.mp4'));
  const healthResponse = await fetch(`${baseUrl}/healthz`);
  const health = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(health.queue.stats.queued, 1);
  assert.equal('currentTask' in health.queue.stats, false);
  assert.equal('nextTasks' in health.queue.stats, false);
  assert.doesNotMatch(JSON.stringify(health.queue), /SENSITIVE|T-PRIVATE-HEALTH|U001/);

  const beforeSetting = app.db.prepare(
    "SELECT value_json FROM settings WHERE key = 'capacityWarnPercent'"
  ).get().value_json;
  const beforeAudits = app.db.prepare(
    "SELECT COUNT(*) count FROM audit_logs WHERE type = '系统配置变更'"
  ).get().count;
  const invalid = await admin.request('/api/system/settings', {
    method: 'PATCH',
    body: {
      capacityWarnPercent: 77,
      confidenceThreshold: 9
    }
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'INVALID_SETTING');
  const afterSetting = app.db.prepare(
    "SELECT value_json FROM settings WHERE key = 'capacityWarnPercent'"
  ).get().value_json;
  const afterAudits = app.db.prepare(
    "SELECT COUNT(*) count FROM audit_logs WHERE type = '系统配置变更'"
  ).get().count;
  assert.equal(afterSetting, beforeSetting);
  assert.equal(afterAudits, beforeAudits);

  await admin.json('/api/system/settings', {
    method: 'PATCH',
    body: {
      videoQuotaGb: 300,
      capacityWarnPercent: 80,
      confidenceThreshold: 0.9
    }
  });
  const settingValues = Object.fromEntries(app.db.prepare(`
    SELECT key, value_json FROM settings
    WHERE key IN ('videoQuotaGb', 'capacityWarnPercent', 'confidenceThreshold')
  `).all().map((row) => [row.key, JSON.parse(row.value_json)]));
  assert.deepEqual(settingValues, {
    videoQuotaGb: 300,
    capacityWarnPercent: 80,
    confidenceThreshold: 0.9
  });

  app.db.exec(`
    CREATE TRIGGER forced_setting_failure
    BEFORE UPDATE ON settings
    WHEN NEW.key = 'capacityWarnPercent'
    BEGIN
      SELECT RAISE(ABORT, 'forced setting failure');
    END
  `);
  try {
    const internal = await admin.request('/api/system/settings', {
      method: 'PATCH',
      body: { capacityWarnPercent: 80 }
    });
    assert.equal(internal.status, 500);
    assert.equal((await internal.json()).error.code, 'INTERNAL_ERROR');
  } finally {
    app.db.exec('DROP TRIGGER forced_setting_failure');
  }
});

test('部署与 ASR CLI 严重缺陷保持已修复状态', () => {
  const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');
  const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8');
  const installer = readFileSync(join(root, 'packaging', 'linux', 'install.sh'), 'utf8');
  const speech = readFileSync(join(root, 'src', 'services', 'speech-recognition.js'), 'utf8');
  const fetchAssets = readFileSync(join(root, 'scripts', 'fetch-release-assets.mjs'), 'utf8');
  const exporter = readFileSync(join(root, 'src', 'services', 'exporter.js'), 'utf8');

  assert.match(dockerfile, /fetch-release-assets\.mjs --fonts/);
  assert.match(dockerfile, /PDF_FONT_PATH=.*NotoSansCJKsc-VF\.ttf/);
  assert.match(compose, /NotoSansCJKsc-VF\.ttf/);
  assert.doesNotMatch(dockerfile, /PDF_FONT_PATH=.*NotoSansCJK-Regular\.ttc/);
  assert.doesNotMatch(compose, /NotoSansCJK-Regular\.ttc/);

  assert.doesNotMatch(installer, /case "\$INSTALL_DIR \$DATA_DIR"/);
  assert.match(installer, /case "\$INSTALL_DIR" in/);
  assert.match(installer, /case "\$DATA_DIR" in/);

  assert.match(speech, /'-ojf'/);
  assert.doesNotMatch(speech, /'-oj',/);
  assert.match(fetchAssets, /AbortSignal\.timeout\(/);
  assert.match(exporter, /formatOptionalDateTime\(record\.submittedAt, '未提交'\)/);
  assert.match(exporter, /formatOptionalDateTime\(record\.verifiedAt, '未复核'\)/);
  assert.match(exporter, /document\.wrap\(footerNote, width, footerSize\)/);
});

test('Windows 控制面板不会误认外部服务并优先显示初始口令', () => {
  const control = readFileSync(
    join(root, 'packaging', 'windows', 'TianpingControl.cs'),
    'utf8'
  );
  assert.match(control, /using System\.Net\.NetworkInformation;/);
  assert.match(control, /internal static int FindRunningPort\(Settings settings\)\s*\{\s*if \(GetRecordedProcess\(\) == null\) return 0;/);
  assert.match(control, /executable,\s*Path\.GetFullPath\(AppPaths\.NodeExe\)/);
  assert.match(control, /private static bool CanUsePort\(int port, string host\)/);

  const credentialsStart = control.indexOf('private void UpdateCredentials()');
  const credentialsEnd = control.indexOf('private void SetButtons(', credentialsStart);
  assert.ok(credentialsStart >= 0 && credentialsEnd > credentialsStart);
  const credentials = control.slice(credentialsStart, credentialsEnd);
  const passwordRead = credentials.indexOf('string password = ServerManager.ReadInitialPassword()');
  const databaseCheck = credentials.indexOf('File.Exists(Path.Combine(AppPaths.DataRoot, "tianping.db"))');
  assert.ok(passwordRead >= 0);
  assert.ok(databaseCheck > passwordRead);
});
