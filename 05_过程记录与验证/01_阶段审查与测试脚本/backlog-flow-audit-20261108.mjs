import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { startServer } from '../server.js';

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
  }

  async request(path, options = {}) {
    const method = options.method || 'GET';
    const headers = {
      ...(this.cookie ? { Cookie: this.cookie } : {}),
      ...(this.csrf && method !== 'GET' ? { 'X-CSRF-Token': this.csrf } : {}),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {})
    };
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    if (response.headers.get('set-cookie')) {
      this.cookie = cookieFrom(response);
    }
    return response;
  }

  async loginAndChange(account, oldPassword, newPassword) {
    let response = await this.request('/api/auth/login', {
      method: 'POST',
      body: { account, password: oldPassword }
    });
    if (response.status !== 200) throw new Error(await response.text());
    const login = await response.json();
    this.csrf = login.csrfToken;
    if (login.user.mustChangePassword) {
      response = await this.request('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: oldPassword, newPassword }
      });
      if (response.status !== 200) throw new Error(await response.text());
    }
  }
}

function cloneRecord(db, sourceId, targetId) {
  const columns = db.prepare('PRAGMA table_info(records)').all()
    .map((row) => row.name);
  const fields = columns.filter((column) => column !== 'id');
  const overrides = {
    task_id: null,
    date: '2026-11-08',
    status: '待提交',
    submitted_by: null,
    submitted_at: null,
    submitted_from: null,
    verified_by: null,
    verified_at: null,
    verified_from: null,
    checks_json: '{}',
    modifications_json: '[]'
  };
  const parameters = [];
  const selectFields = fields.map((field) => {
    if (!Object.hasOwn(overrides, field)) return field;
    parameters.push(overrides[field]);
    return '?';
  });
  db.prepare(`
    INSERT INTO records (id, ${fields.join(',')})
    SELECT ?, ${selectFields.join(',')}
    FROM records
    WHERE id = ?
  `).run(targetId, ...parameters, sourceId);
}

const temp = mkdtempSync(join(tmpdir(), 'tianping-backlog-flow-'));
let app;
try {
  const port = await freePort();
  app = await startServer({
    port,
    host: '127.0.0.1',
    dataDir: temp,
    initialPassword: 'Tp123456',
    workerIntervalMs: 600_000
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const inspector = new Client(baseUrl);
  const verifier = new Client(baseUrl);
  await inspector.loginAndChange('U001', 'Tp123456', 'TpBacklog1234');
  await verifier.loginAndChange('U003', 'Tp123456', 'TpReview1234');

  cloneRecord(app.db, '20260928-F001-01', 'BACKLOG-TRANSITION-01');
  const insertTask = app.db.prepare(`
    INSERT INTO tasks (
      id, file_name, file_path, size_bytes, user_id, device_id, status,
      started_at, queued_at, sha256, created_at, updated_at
    ) VALUES (?, ?, ?, 1024, 'U001', 'F001', '排队中', '2026-11-08 10:00',
      ?, ?, '2026-11-08 10:00', '2026-11-08 10:00')
  `);
  app.db.exec('BEGIN IMMEDIATE');
  for (let index = 0; index < 20; index += 1) {
    const id = `T-PR016-${String(index).padStart(2, '0')}`;
    insertTask.run(
      id,
      `${id}.mp4`,
      join(temp, `${id}.mp4`),
      `2026-11-08 10:${String(index).padStart(2, '0')}`,
      'B'.repeat(64)
    );
  }
  app.db.exec('COMMIT');

  const listStart = performance.now();
  const list = await inspector.request('/api/records?page=1&pageSize=50');
  const listMs = performance.now() - listStart;
  if (list.status !== 200) throw new Error(await list.text());
  await list.arrayBuffer();

  const submitStart = performance.now();
  const submit = await inspector.request('/api/records/BACKLOG-TRANSITION-01/submit', {
    method: 'POST',
    body: {}
  });
  const submitMs = performance.now() - submitStart;
  const submitBody = await submit.json();
  if (submit.status !== 200) throw new Error(JSON.stringify(submitBody));

  const confirmStart = performance.now();
  const confirm = await verifier.request('/api/records/BACKLOG-TRANSITION-01/confirm', {
    method: 'POST',
    body: {}
  });
  const confirmMs = performance.now() - confirmStart;
  const confirmBody = await confirm.json();
  if (confirm.status !== 200) throw new Error(JSON.stringify(confirmBody));

  console.log(JSON.stringify({
    queuedTasks: app.db.prepare(
      "SELECT COUNT(*) AS count FROM tasks WHERE status = '排队中'"
    ).get().count,
    list: { status: list.status, elapsedMs: listMs },
    submit: {
      status: submit.status,
      elapsedMs: submitMs,
      recordStatus: submitBody.record?.status
    },
    confirm: {
      status: confirm.status,
      elapsedMs: confirmMs,
      recordStatus: confirmBody.status
    }
  }, null, 2));
} finally {
  if (app) await app.close();
  rmSync(temp, { recursive: true, force: true });
}
