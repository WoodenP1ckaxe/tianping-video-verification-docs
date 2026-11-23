import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from '../server.js';
import { evaluateRecord } from '../src/rules.js';

const results = [];
const observations = {};
const tempRoots = [];
const apps = [];

function safeResult(name, status, detail) {
  results.push({ name, status, detail });
}

async function check(name, callback) {
  try {
    const detail = await callback();
    safeResult(name, '通过', detail ?? '');
  } catch (error) {
    safeResult(name, '失败', error?.stack || String(error));
  }
}

function newTemp(prefix) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(directory);
  return directory;
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

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
    this.user = null;
  }

  async request(path, options = {}) {
    const method = options.method || 'GET';
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const headers = {
      ...(this.cookie ? { Cookie: this.cookie } : {}),
      ...(this.csrf && mutating && options.csrf !== false
        ? { 'X-CSRF-Token': this.csrf }
        : {}),
      ...(options.headers || {})
    };
    let body = options.rawBody;
    if (body === undefined && options.body !== undefined) {
      body = JSON.stringify(options.body);
    }
    if (body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = options.contentType || 'application/json';
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = cookieFrom(response);
    return response;
  }

  async login(account, password) {
    const response = await this.request('/api/auth/login', {
      method: 'POST',
      body: { account, password },
      csrf: false
    });
    await requireStatus(response, 200);
    const payload = await response.json();
    this.csrf = payload.csrfToken;
    this.user = payload.user;
    return payload;
  }

  async loginAndChange(account, initialPassword, newPassword) {
    const payload = await this.login(account, initialPassword);
    assert.equal(payload.user.mustChangePassword, true);
    const response = await this.request('/api/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: initialPassword,
        newPassword
      }
    });
    await requireStatus(response, 200);
  }
}

async function requireStatus(response, expected) {
  if (response.status !== expected) {
    assert.fail(`HTTP ${response.status}，预期 ${expected}：${await response.text()}`);
  }
}

async function statusCode(client, path, options = {}) {
  const response = await client.request(path, options);
  const body = await response.json().catch(() => null);
  return {
    status: response.status,
    code: body?.error?.code || null,
    body
  };
}

function percentile(samples, ratio) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function latencySummary(samples) {
  return {
    count: samples.length,
    minMs: Math.min(...samples),
    medianMs: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    maxMs: Math.max(...samples)
  };
}

async function timed(client, path, options = {}) {
  const start = performance.now();
  const response = await client.request(path, options);
  const elapsed = performance.now() - start;
  await response.arrayBuffer();
  assert.ok(response.ok, `HTTP ${response.status} for ${path}`);
  return elapsed;
}

function seedAdditionalAccounts(admin, baseUrl) {
  return Promise.all([
    admin.request('/api/accounts', {
      method: 'POST',
      body: {
        id: 'U005',
        name: '并发检验员',
        role: 'inspector',
        status: '启用',
        initialPassword: 'TpSeed1234'
      }
    }).then((response) => assert.equal(response.status, 201, `U005 ${response.status}`)),
    admin.request('/api/accounts', {
      method: 'POST',
      body: {
        id: 'U006',
        name: '并发复核员',
        role: 'verifier',
        status: '启用',
        initialPassword: 'TpSeed1234'
      }
    }).then((response) => assert.equal(response.status, 201, `U006 ${response.status}`))
  ]).then(async () => {
    const clients = [
      new Client(baseUrl),
      new Client(baseUrl)
    ];
    await clients[0].loginAndChange('U005', 'TpSeed1234', 'TpUser1234');
    await clients[1].loginAndChange('U006', 'TpSeed1234', 'TpUser5678');
    return clients;
  });
}

function cloneRecord(db, sourceId, targetId, overrides = {}) {
  const columns = db.prepare('PRAGMA table_info(records)').all().map((row) => row.name);
  const fields = columns.filter((column) => column !== 'id');
  const parameters = [];
  const selectFields = fields.map((field) => {
    if (!Object.hasOwn(overrides, field)) return field;
    parameters.push(overrides[field]);
    return '?';
  });
  const insert = db.prepare(`
    INSERT INTO records (id, ${fields.join(',')})
    SELECT ?, ${selectFields.join(',')}
    FROM records
    WHERE id = ?
  `);
  insert.run(targetId, ...parameters, sourceId);
}

function seedTenThousandRecords(db) {
  const sourceId = '20260928-F001-01';
  const before = db.prepare('SELECT COUNT(*) AS count FROM records').get().count;
  const columns = db.prepare('PRAGMA table_info(records)').all().map((row) => row.name);
  const fields = columns.filter((column) => column !== 'id');
  const selectFields = fields.map((field) => field === 'task_id' ? 'NULL' : field);
  const insert = db.prepare(`
    INSERT INTO records (id, ${fields.join(',')})
    SELECT ?, ${selectFields.join(',')}
    FROM records
    WHERE id = ?
  `);
  const update = db.prepare(`
    UPDATE records
    SET date = ?, inspector_id = ?, task_id = NULL
    WHERE id = ?
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (let index = 0; index < 10_000 - before; index += 1) {
      const id = `PERF-${String(index).padStart(5, '0')}`;
      insert.run(id, sourceId);
      const day = String((index % 28) + 1).padStart(2, '0');
      update.run(`2025-${String((index % 12) + 1).padStart(2, '0')}-${day}`,
        index % 2 ? 'U001' : 'U002', id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return db.prepare('SELECT COUNT(*) AS count FROM records').get().count;
}

async function backupRestoreCheck(app, admin, dataDir) {
  const response = await admin.request('/api/system/backup', {
    method: 'POST',
    body: {}
  });
  await requireStatus(response, 201);
  const backup = await response.json();
  const backupPath = join(dataDir, 'backups', backup.file);
  assert.equal(existsSync(backupPath), true);
  const backupDb = new DatabaseSync(backupPath, { readOnly: true });
  const integrity = backupDb.prepare('PRAGMA integrity_check').get();
  const sourceCounts = Object.fromEntries(
    ['users', 'records', 'audit_logs'].map((table) => [
      table,
      backupDb.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count
    ])
  );
  backupDb.close();
  assert.equal(Object.values(integrity)[0], 'ok');

  const restoreRoot = newTemp('tianping-full-restore-');
  copyFileSync(backupPath, join(restoreRoot, 'tianping.db'));
  const restored = await startServer({
    port: await freePort(),
    host: '127.0.0.1',
    dataDir: restoreRoot,
    initialPassword: 'Unused1234',
    workerIntervalMs: 600_000
  });
  apps.push(restored);
  const restoredCounts = Object.fromEntries(
    ['users', 'records', 'audit_logs'].map((table) => [
      table,
      restored.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count
    ])
  );
  const restoredBase = `http://127.0.0.1:${restored.address.port}`;
  const restoredAdmin = new Client(restoredBase);
  await restoredAdmin.login('U000', 'TpAdmin1234');
  assert.deepEqual(restoredCounts, sourceCounts);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS count FROM records').get().count,
    sourceCounts.records);
  return {
    backupFile: backup.file,
    backupBytes: backup.size,
    counts: sourceCounts
  };
}

async function missingMediaHealthCheck() {
  const dataDir = newTemp('tianping-health-missing-');
  const app = await startServer({
    port: await freePort(),
    host: '127.0.0.1',
    dataDir,
    initialPassword: 'TpHealth1234',
    workerIntervalMs: 600_000,
    ffprobePath: 'definitely-missing-ffprobe.exe',
    ffmpegPath: 'definitely-missing-ffmpeg.exe'
  });
  apps.push(app);
  const response = await fetch(`http://127.0.0.1:${app.address.port}/healthz`);
  const body = await response.json();
  observations.missingMediaHealth = {
    status: response.status,
    body
  };
  assert.notEqual(response.status, 200,
    '媒体工具不可用时 /healthz 仍报告整体正常');
  assert.equal(body.status, 'error');
  assert.equal(body.analyzer.available, false);
  return observations.missingMediaHealth;
}

async function restartRecoveryCheck() {
  const dataDir = newTemp('tianping-restart-');
  const first = await startServer({
    port: await freePort(),
    host: '127.0.0.1',
    dataDir,
    initialPassword: 'TpRestart1234',
    workerIntervalMs: 600_000
  });
  insertTask(first.db, 'T-RESTART-ACTIVE', '分析中');
  insertTask(first.db, 'T-RESTART-QUEUED', '排队中');
  await first.close();
  const second = await startServer({
    port: await freePort(),
    host: '127.0.0.1',
    dataDir,
    workerIntervalMs: 600_000
  });
  apps.push(second);
  const active = second.db.prepare(
    'SELECT status, error_code FROM tasks WHERE id = ?'
  ).get('T-RESTART-ACTIVE');
  const queued = second.db.prepare(
    'SELECT status FROM tasks WHERE id = ?'
  ).get('T-RESTART-QUEUED');
  assert.equal(active.status, '失败');
  assert.equal(active.error_code, 'E-RESTARTED');
  assert.equal(queued.status, '排队中');
  return { active, queued };
}

function insertTask(db, id, status) {
  db.prepare(`
    INSERT INTO tasks (
      id, file_name, file_path, size_bytes, user_id, status, started_at,
      queued_at, analysis_started_at, sha256, created_at, updated_at
    ) VALUES (
      ?, 'restart.mp4', ?, 16, 'U001', ?, '2026-11-08 10:00',
      '2026-11-08 10:00', ?, ?, '2026-11-08 10:00', '2026-11-08 10:00'
    )
  `).run(
    id,
    join(db.path || tmpdir(), `${id}.mp4`),
    status,
    status === '分析中' ? '2026-11-08 10:01' : null,
    'A'.repeat(64)
  );
}

async function gracefulShutdownProbe() {
  const dataDir = newTemp('tianping-shutdown-');
  const app = await startServer({
    port: await freePort(),
    host: '127.0.0.1',
    dataDir,
    initialPassword: 'TpShutdown1234',
    workerIntervalMs: 10,
    analyzer: async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      throw new Error('probe analyzer completed after shutdown');
    }
  });
  insertTask(app.db, 'T-SHUTDOWN-INFLIGHT', '排队中');
  for (let index = 0; index < 50; index += 1) {
    const row = app.db.prepare(
      'SELECT status FROM tasks WHERE id = ?'
    ).get('T-SHUTDOWN-INFLIGHT');
    if (row.status === '分析中') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const started = performance.now();
  await app.close();
  const closeMs = performance.now() - started;
  await new Promise((resolve) => setTimeout(resolve, 500));
  const reopened = new DatabaseSync(join(dataDir, 'tianping.db'), {
    readOnly: true
  });
  const row = reopened.prepare(
    'SELECT status, error_code, error_reason FROM tasks WHERE id = ?'
  ).get('T-SHUTDOWN-INFLIGHT');
  reopened.close();
  observations.gracefulShutdown = { closeMs, taskAfterInFlightWork: row };
  return observations.gracefulShutdown;
}

function fuzzRules() {
  const device = {
    id: 'FUZZ',
    max: 220,
    d: 0.1,
    ranges: 1,
    range1: { max: 220, d: 0.1 },
    range2: null,
    points: [200, 50, 10],
    pointRange: [1, 1, 1],
    tol: 0.05
  };
  let passed = 0;
  let failed = 0;
  for (let sample = 0; sample < 2000; sample += 1) {
    const points = [200, 50, 10];
    const values = points.flatMap((nominal, pointIndex) => Array.from(
      { length: 3 },
      () => {
        const exceed = sample % 5 === 0 && pointIndex === 2;
        return nominal + (Math.random() - 0.5) * (exceed ? 0.03 : 0.002);
      }
    ));
    const record = {
      recognition: { segments: [] },
      readouts: values.map((value, index) => ({
        point: Math.floor(index / 3),
        idx: (index % 3) + 1,
        key: `I${Math.floor(index / 3) + 1}-${(index % 3) + 1}`,
        value,
        unit: 'g',
        off: index * 10,
        stable: true,
        conf: 0.99,
        range: 1
      })),
      rangeSwitch: true
    };
    const evaluation = evaluateRecord(record, device, 0.05);
    assert.ok(['通过', '不通过'].includes(evaluation.conclusion));
    assert.equal(Array.isArray(evaluation.items), true);
    assert.equal(Array.isArray(evaluation.reasons), true);
    if (evaluation.pass) {
      passed += 1;
      assert.equal(evaluation.reasons.length, 0);
      assert.ok(evaluation.items.every((item) =>
        item.inLimit && !item.missing && item.stable));
    } else {
      failed += 1;
      assert.ok(evaluation.reasons.length > 0);
    }
  }
  return { samples: 2000, passed, failed };
}

let primary;
try {
  const dataDir = newTemp('tianping-full-audit-');
  const port = await freePort();
  primary = await startServer({
    port,
    host: '127.0.0.1',
    dataDir,
    initialPassword: 'Tp123456',
    workerIntervalMs: 600_000,
    maxActiveUploadsPerUser: 3
  });
  apps.push(primary);
  const baseUrl = `http://127.0.0.1:${port}`;

  const inspector = new Client(baseUrl);
  const verifier = new Client(baseUrl);
  const admin = new Client(baseUrl);
  await inspector.loginAndChange('U001', 'Tp123456', 'TpInspector1234');
  await verifier.loginAndChange('U003', 'Tp123456', 'TpVerifier1234');
  await admin.loginAndChange('U000', 'Tp123456', 'TpAdmin1234');

  await check('静态首页与安全响应头', async () => {
    const response = await fetch(baseUrl);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    return response.headers.get('content-security-policy');
  });

  await check('未登录访问 API 返回 401', async () => {
    const result = await statusCode(new Client(baseUrl), '/api/session');
    assert.equal(result.status, 401);
    assert.equal(result.code, 'AUTH_REQUIRED');
    return result;
  });

  await check('CSRF 缺失与错误令牌均被拒绝', async () => {
    const missing = await statusCode(inspector, '/api/records/20260928-F001-01', {
      method: 'PATCH',
      body: { field: 'remark', value: 'x' },
      csrf: false
    });
    const invalid = await statusCode(inspector, '/api/records/20260928-F001-01', {
      method: 'PATCH',
      body: { field: 'remark', value: 'x' },
      headers: { 'X-CSRF-Token': 'invalid-token' }
    });
    assert.equal(missing.status, 403);
    assert.equal(invalid.status, 403);
    assert.equal(missing.code, 'CSRF_INVALID');
    assert.equal(invalid.code, 'CSRF_INVALID');
    return { missing, invalid };
  });

  await check('角色权限矩阵', async () => {
    const matrix = {
      inspectorAudit: await statusCode(inspector, '/api/audit'),
      verifierAudit: await statusCode(verifier, '/api/audit'),
      adminAudit: await statusCode(admin, '/api/audit'),
      inspectorAccounts: await statusCode(inspector, '/api/accounts'),
      verifierAccounts: await statusCode(verifier, '/api/accounts'),
      adminAccounts: await statusCode(admin, '/api/accounts'),
      inspectorDeviceWrite: await statusCode(inspector, '/api/devices', {
        method: 'POST',
        body: {}
      }),
      verifierDeviceWrite: await statusCode(verifier, '/api/devices', {
        method: 'POST',
        body: {}
      }),
      inspectorConfirm: await statusCode(inspector,
        '/api/records/20260928-F002-01/confirm', {
          method: 'POST',
          body: {}
        }),
      verifierPersonQr: await statusCode(verifier,
        '/api/qr/person.svg?account=U003'),
      verifierDeviceQr: await statusCode(verifier, '/api/qr/device/F001.svg'),
      adminPersonQrForInspector: await statusCode(admin,
        '/api/qr/person.svg?account=U001')
    };
    observations.roleMatrix = Object.fromEntries(
      Object.entries(matrix).map(([key, value]) => [key, value.status])
    );
    assert.equal(matrix.inspectorAudit.status, 403);
    assert.equal(matrix.verifierAudit.status, 403);
    assert.equal(matrix.adminAudit.status, 200);
    assert.equal(matrix.inspectorAccounts.status, 403);
    assert.equal(matrix.verifierAccounts.status, 403);
    assert.equal(matrix.adminAccounts.status, 200);
    assert.equal(matrix.inspectorDeviceWrite.status, 403);
    assert.equal(matrix.verifierDeviceWrite.status, 400);
    assert.equal(matrix.inspectorConfirm.status, 403);
    assert.equal(matrix.verifierPersonQr.status, 403);
    assert.equal(matrix.verifierDeviceQr.status, 200);
    assert.equal(matrix.adminPersonQrForInspector.status, 200);
    return observations.roleMatrix;
  });

  await check('非法 JSON 与 2MB 请求体上限', async () => {
    const malformed = await inspector.request('/api/records/20260928-F001-01', {
      method: 'PATCH',
      rawBody: '{"field":',
      contentType: 'application/json'
    });
    const malformedBody = await malformed.json();
    const oversized = await inspector.request('/api/records/20260928-F001-01', {
      method: 'PATCH',
      rawBody: JSON.stringify({ padding: 'x'.repeat(2 * 1024 * 1024 + 64) }),
      contentType: 'application/json'
    });
    const oversizedBody = await oversized.json();
    assert.equal(malformed.status, 400);
    assert.equal(malformedBody.error.code, 'INVALID_JSON');
    assert.equal(oversized.status, 413);
    assert.equal(oversizedBody.error.code, 'BODY_TOO_LARGE');
    return {
      malformed: malformed.status,
      oversized: oversized.status
    };
  });

  await check('登录空 JSON 对象应返回客户端错误', async () => {
    const response = await new Client(baseUrl).request('/api/auth/login', {
      method: 'POST',
      rawBody: 'null',
      contentType: 'application/json',
      csrf: false
    });
    const body = await response.json();
    observations.loginNullBody = { status: response.status, body };
    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'INVALID_JSON');
  });

  await check('日期筛选拒绝不存在的日历日期', async () => {
    const result = await statusCode(inspector,
      '/api/records?from=2026-02-30&to=2026-03-02');
    observations.invalidCalendarFilter = result;
    assert.equal(result.status, 400);
    assert.equal(result.code, 'VALIDATION_ERROR');
  });

  await check('上传初始校验与路径净化', async () => {
    const base = {
      sizeBytes: 1,
      startedAt: '2026-11-08 10:00',
      timeConfirmed: true,
      expectedDeviceId: 'F001'
    };
    const unsupported = await statusCode(inspector, '/api/uploads/init', {
      method: 'POST',
      body: { ...base, fileName: 'sample.avi' }
    });
    const oversized = await statusCode(inspector, '/api/uploads/init', {
      method: 'POST',
      body: { ...base, fileName: 'large.mp4', sizeBytes: 500 * 1024 * 1024 + 1 }
    });
    const inactiveDevice = await statusCode(inspector, '/api/uploads/init', {
      method: 'POST',
      body: { ...base, fileName: 'inactive.mp4', expectedDeviceId: 'F003' }
    });
    const traversalResponse = await inspector.request('/api/uploads/init', {
      method: 'POST',
      body: { ...base, fileName: '../../outside.mp4' }
    });
    await requireStatus(traversalResponse, 201);
    const traversal = await traversalResponse.json();
    const cancel = await inspector.request(`/api/uploads/${traversal.uploadId}`, {
      method: 'DELETE'
    });
    assert.equal(cancel.status, 200);
    assert.equal(unsupported.status, 415);
    assert.equal(oversized.status, 413);
    assert.equal(inactiveDevice.status, 400);
    assert.equal(traversal.fileName, 'outside.mp4');
    return {
      unsupported: unsupported.status,
      oversized: oversized.status,
      inactiveDevice: inactiveDevice.status,
      sanitizedFilename: traversal.fileName
    };
  });

  await check('上传拍摄时间拒绝不存在的日期和时间', async () => {
    const response = await inspector.request('/api/uploads/init', {
      method: 'POST',
      body: {
        fileName: 'invalid-date.mp4',
        sizeBytes: 1,
        startedAt: '2026-02-30 25:61',
        timeConfirmed: true,
        expectedDeviceId: 'F001'
      }
    });
    const body = await response.json();
    observations.invalidUploadDate = { status: response.status, body };
    if (response.status === 201) {
      await inspector.request(`/api/uploads/${body.uploadId}`, {
        method: 'DELETE'
      });
    }
    assert.equal(response.status, 400);
    assert.equal(body.error?.code, 'INVALID_START_TIME');
  });

  await check('损坏视频上传返回明确客户端错误且可查看失败原因', async () => {
    const fakeVideo = Buffer.from('this is not an mp4 container');
    const init = await inspector.request('/api/uploads/init', {
      method: 'POST',
      body: {
        fileName: 'corrupt.mp4',
        sizeBytes: fakeVideo.length,
        startedAt: '2026-11-08 10:00',
        timeConfirmed: true,
        expectedDeviceId: 'F001'
      }
    });
    await requireStatus(init, 201);
    const upload = await init.json();
    const append = await inspector.request(`/api/uploads/${upload.uploadId}/content`, {
      method: 'PUT',
      rawBody: fakeVideo,
      contentType: 'application/octet-stream',
      headers: {
        'Upload-Offset': '0',
        'Content-Length': String(fakeVideo.length)
      }
    });
    const appendBody = await append.json();
    const detail = await inspector.request(`/api/uploads/${upload.uploadId}`);
    const detailBody = await detail.json();
    observations.corruptVideo = {
      appendStatus: append.status,
      appendBody,
      uploadStatus: detailBody.status,
      uploadError: detailBody.error
    };
    assert.ok([400, 415, 422].includes(append.status));
    assert.equal(detailBody.status, '失败');
    assert.ok(detailBody.error?.message);
    return observations.corruptVideo;
  });

  await check('状态转换并发原子性', async () => {
    cloneRecord(primary.db, '20260928-F001-01', 'CONCURRENCY-SUBMIT', {
      date: '2026-11-08',
      task_id: null,
      status: '待提交',
      submitted_by: null,
      submitted_at: null,
      verified_by: null,
      verified_at: null,
      rejected_by: null,
      rejected_at: null,
      reject_reason: null,
      void_by: null,
      void_at: null,
      void_reason: null,
      checks_json: '{}',
      modifications_json: '[]'
    });
    const submitPair = await Promise.all([
      statusCode(inspector, '/api/records/CONCURRENCY-SUBMIT/submit', {
        method: 'POST',
        body: {}
      }),
      statusCode(inspector, '/api/records/CONCURRENCY-SUBMIT/submit', {
        method: 'POST',
        body: {}
      })
    ]);
    assert.deepEqual(submitPair.map((item) => item.status).sort(), [200, 409]);

    const reviewPair = await Promise.all([
      statusCode(verifier, '/api/records/CONCURRENCY-SUBMIT/confirm', {
        method: 'POST',
        body: {}
      }),
      statusCode(verifier, '/api/records/CONCURRENCY-SUBMIT/reject', {
        method: 'POST',
        body: { reason: '并发回归' }
      })
    ]);
    assert.deepEqual(reviewPair.map((item) => item.status).sort(), [200, 409]);
    const final = primary.db.prepare(
      'SELECT status FROM records WHERE id = ?'
    ).get('CONCURRENCY-SUBMIT');
    observations.concurrentTransitions = {
      submit: submitPair.map((item) => item.status),
      review: reviewPair.map((item) => item.status),
      finalStatus: final.status
    };
    return observations.concurrentTransitions;
  });

  await check('另一检验人员不能提交或修改他人记录', async () => {
    const other = new Client(baseUrl);
    await other.loginAndChange('U002', 'Tp123456', 'TpOther1234');
    const submit = await statusCode(other,
      '/api/records/20260926-F001-03/submit', {
        method: 'POST',
        body: {}
      });
    const patch = await statusCode(other,
      '/api/records/20260926-F001-03', {
        method: 'PATCH',
        body: { field: 'remark', value: '越权修改' }
      });
    assert.equal(submit.status, 403);
    assert.equal(patch.status, 403);
    return { submit: submit.status, patch: patch.status };
  });

  await check('口令修改后旧并发会话失效', async () => {
    const a = new Client(baseUrl);
    const b = new Client(baseUrl);
    await a.loginAndChange('U004-LOCK-TEST', 'Unused1234', 'Unused5678')
      .catch(() => {});

    const probe = new Client(baseUrl);
    await probe.login('U003', 'TpVerifier1234');
    const second = new Client(baseUrl);
    await second.login('U003', 'TpVerifier1234');
    const change = await probe.request('/api/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: 'TpVerifier1234',
        newPassword: 'TpVerifier5678'
      }
    });
    assert.equal(change.status, 200);
    const oldSession = await statusCode(second, '/api/session');
    observations.oldSessionAfterPasswordChange = oldSession.status;
    assert.equal(oldSession.status, 401);
  });

  await check('强制会话空闲超时', async () => {
    const session = new Client(baseUrl);
    await session.login('U002', 'TpOther1234');
    const cookieToken = session.cookie.split('=', 2)[1];
    primary.db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?')
      .run(Date.now() - 31 * 60 * 1000, decodeURIComponent(cookieToken));
    const response = await session.request('/api/session');
    assert.equal(response.status, 401);
    return response.status;
  });

  const extraClients = await seedAdditionalAccounts(admin, baseUrl);
  const perfClients = [
    inspector,
    admin,
    new Client(baseUrl),
    ...extraClients
  ];
  await perfClients[2].login('U002', 'TpOther1234');

  await check('一万条记录规模下查询与汇总 P95 ≤ 2 秒', async () => {
    const total = seedTenThousandRecords(primary.db);
    const listSamples = [];
    const detailSamples = [];
    const stateSamples = [];
    const conclusionSamples = [];
    for (let index = 0; index < 20; index += 1) {
      listSamples.push(await timed(inspector,
        `/api/records?page=${(index % 50) + 1}&pageSize=50`));
      const recordId = `PERF-${String((index * 137) % 10_000).padStart(5, '0')}`;
      detailSamples.push(await timed(inspector, `/api/records/${recordId}`));
    }
    for (let index = 0; index < 10; index += 1) {
      stateSamples.push(await timed(admin, '/api/state'));
      conclusionSamples.push(await timed(admin,
        `/api/records?conclusion=${encodeURIComponent('通过')}` +
        `&page=${(index % 20) + 1}&pageSize=50`));
    }
    const concurrentSamples = [];
    for (let round = 0; round < 6; round += 1) {
      const start = performance.now();
      const responses = await Promise.all(perfClients.map((client) =>
        client.request(`/api/records?page=${round + 1}&pageSize=50`)));
      responses.forEach((response) => assert.equal(response.status, 200));
      await Promise.all(responses.map((response) => response.arrayBuffer()));
      concurrentSamples.push(performance.now() - start);
    }
    const metrics = {
      totalRecords: total,
      list: latencySummary(listSamples),
      detail: latencySummary(detailSamples),
      state: latencySummary(stateSamples),
      conclusionFilter: latencySummary(conclusionSamples),
      fiveUsersConcurrent: latencySummary(concurrentSamples)
    };
    observations.performance = metrics;
    for (const metric of [
      metrics.list,
      metrics.detail,
      metrics.state,
      metrics.conclusionFilter,
      metrics.fiveUsersConcurrent
    ]) {
      assert.ok(metric.p95Ms <= 2000,
        `P95 ${metric.p95Ms.toFixed(2)}ms exceeded 2000ms`);
    }
    return metrics;
  });

  await check('手动备份完整性及实际恢复', () =>
    backupRestoreCheck(primary, admin, dataDir));

  await check('20 段积压时页面查询与业务读取可用', async () => {
    const insertTask = primary.db.prepare(`
      INSERT INTO tasks (
        id, file_name, file_path, size_bytes, user_id, device_id, status,
        started_at, queued_at, sha256, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 1024, 'U001', 'F001', '排队中', '2026-11-08 10:00',
        ?, ?, '2026-11-08 10:00', '2026-11-08 10:00'
      )
    `);
    primary.db.exec('BEGIN IMMEDIATE');
    for (let index = 0; index < 20; index += 1) {
      const id = `T-BACKLOG-${String(index).padStart(2, '0')}`;
      insertTask.run(
        id,
        `${id}.mp4`,
        join(dataDir, `${id}.mp4`),
        `2026-11-08 10:${String(index).padStart(2, '0')}`,
        'B'.repeat(64)
      );
    }
    primary.db.exec('COMMIT');
    const samples = [];
    for (let index = 0; index < 10; index += 1) {
      samples.push(await timed(inspector, '/api/records?page=1&pageSize=20'));
    }
    const metrics = latencySummary(samples);
    const state = await inspector.request('/api/state');
    assert.equal(state.status, 200);
    const tasks = primary.db.prepare(
      "SELECT COUNT(*) AS count FROM tasks WHERE status = '排队中'"
    ).get().count;
    assert.ok(tasks >= 20);
    assert.ok(metrics.p95Ms <= 2000);
    return { queue: tasks, query: metrics };
  });

  await check('健康检查能反映分析媒体工具不可用', missingMediaHealthCheck);
  await check('重启后中断任务失败、排队任务保留', restartRecoveryCheck);
  await check('规则引擎 2000 组随机稳定读数不变量', async () => fuzzRules());

  await check('分析中任务在优雅关闭时得到确定状态', async () => {
    const detail = await gracefulShutdownProbe();
    assert.notEqual(detail.taskAfterInFlightWork.status, '分析中');
    return detail;
  });
} catch (error) {
  safeResult('测试框架执行', '失败', error?.stack || String(error));
} finally {
  for (const app of apps.reverse()) {
    try {
      await app.close();
    } catch {
      // Continue cleanup; the specific test result already captures failures.
    }
  }
  for (const root of tempRoots.reverse()) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Temporary cleanup is best effort.
    }
  }
}

const counts = results.reduce((summary, item) => {
  summary[item.status] = (summary[item.status] || 0) + 1;
  return summary;
}, {});
console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  node: process.version,
  counts,
  results,
  observations
}, null, 2));
