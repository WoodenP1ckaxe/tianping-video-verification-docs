import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { startServer } from '../../server.js';

const sourceRoot = join(import.meta.dirname, '..', '..');
const videoPath = join(
  sourceRoot,
  'verification',
  'synthetic-samples',
  'synthetic-single-F001-U001.mp4',
);
const video = readFileSync(videoPath);
const runCount = Number(process.env.STRESS_RUNS || 20);
const chunkSize = 8 * 1024 * 1024;

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
      ...(this.csrf && !['GET', 'HEAD'].includes(method)
        ? { 'X-CSRF-Token': this.csrf }
        : {}),
      ...(options.headers || {}),
    };
    let body = options.body;
    if (body !== undefined && !Buffer.isBuffer(body) && typeof body !== 'string') {
      body = JSON.stringify(body);
      headers['Content-Type'] ||= 'application/json';
    }
    let response;
    let lastError;
    const attempts = method === 'GET' ? 3 : 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers,
          body,
        });
        break;
      } catch (error) {
        lastError = error;
        if (attempt === attempts) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
    if (!response) throw lastError;
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = cookieFrom(response);
    return response;
  }

  async json(path, options = {}, expected = 200) {
    const response = await this.request(path, options);
    const body = await response.json();
    assert.equal(
      response.status,
      expected,
      `${options.method || 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`,
    );
    return body;
  }
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

const temporary = mkdtempSync(join(tmpdir(), 'tianping-queue-stress-'));
let app;
let succeeded = false;
console.log(`temporary=${temporary}`);
try {
  const port = await freePort();
  app = await startServer({
    port,
    host: '127.0.0.1',
    dataDir: temporary,
    initialPassword: 'FullStress1234',
    workerIntervalMs: 40,
    maxActiveUploadsPerUser: 3,
    maxActiveUploadsGlobal: 6,
    minFreeDiskBytes: 0,
  });
  app.server.once('close', () => console.log('server-close-event'));
  app.server.on('clientError', (error, socket) => {
    console.error(`server-client-error=${error.code || error.message}`);
    socket.destroy();
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const client = new Client(baseUrl);
  const login = await client.json('/api/auth/login', {
    method: 'POST',
    body: { account: 'U001', password: 'FullStress1234' },
  });
  client.csrf = login.csrfToken;
  if (login.user.mustChangePassword) {
    await client.json('/api/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: 'FullStress1234',
        newPassword: 'FullStress5678',
      },
    });
  }

  const taskIds = [];
  const uploadDurations = [];
  const started = performance.now();
  let maxQueued = 0;
  let maxRunning = 0;

  for (let run = 1; run <= runCount; run += 1) {
    const initStarted = performance.now();
    const init = await client.json('/api/uploads/init', {
      method: 'POST',
      body: {
        fileName: `stress-${String(run).padStart(2, '0')}.mp4`,
        sizeBytes: video.length,
        startedAt: '2026-09-28 11:05',
        timeConfirmed: true,
        expectedDeviceId: 'F001',
      },
    }, 201);

    let offset = 0;
    let complete;
    while (offset < video.length) {
      const end = Math.min(video.length, offset + chunkSize);
      const chunk = video.subarray(offset, end);
      const response = await client.request(
        `/api/uploads/${init.uploadId}/content`,
        {
          method: 'PUT',
          body: chunk,
          headers: {
            'Upload-Offset': String(offset),
            'Content-Length': String(chunk.length),
          },
        },
      );
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      offset = body.receivedBytes;
      if (offset === video.length) complete = body;
    }
    assert.ok(complete?.taskId, `第 ${run} 次上传未创建任务`);
    taskIds.push(complete.taskId);
    uploadDurations.push(performance.now() - initStarted);

    const state = await client.json('/api/state');
    const active = state.tasks.filter((task) => (
      taskIds.includes(task.id) && !['已完成', '失败', '待人工处理', '已取消'].includes(task.status)
    ));
    maxQueued = Math.max(maxQueued, active.filter((task) => task.status === '排队中').length);
    maxRunning = Math.max(maxRunning, active.filter((task) => task.status === '分析中').length);
    console.log(`uploaded ${run}/${runCount}: task=${complete.taskId} active=${active.length}`);
  }

  const uploadFinished = performance.now();
  let tasks = [];
  for (let attempt = 0; attempt < 1800; attempt += 1) {
    const state = await client.json('/api/state');
    tasks = state.tasks.filter((task) => taskIds.includes(task.id));
    const queued = tasks.filter((task) => task.status === '排队中').length;
    const running = tasks.filter((task) => task.status === '分析中').length;
    maxQueued = Math.max(maxQueued, queued);
    maxRunning = Math.max(maxRunning, running);
    if (tasks.length === runCount && tasks.every((task) => (
      ['已完成', '失败', '待人工处理', '已取消'].includes(task.status)
    ))) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const finished = performance.now();

  assert.equal(tasks.length, runCount, `任务数量 ${tasks.length}/${runCount}`);
  assert.ok(tasks.every((task) => task.status === '已完成'),
    `非完成任务：${tasks.filter((task) => task.status !== '已完成')
      .map((task) => `${task.id}:${task.status}:${task.reason || ''}`).join(', ')}`);
  assert.equal(new Set(tasks.map((task) => task.recordId)).size, runCount,
    '记录 ID 出现重复');
  assert.equal(new Set(tasks.map((task) => task.id)).size, runCount,
    '任务 ID 出现重复');

  for (const task of tasks) {
    const detail = await client.json(`/api/records/${task.recordId}`);
    assert.equal(detail.record.status, '待提交');
    assert.equal(detail.record.readouts.length, 9);
    assert.ok(detail.record.readouts.every((readout) => readout.screenshot));
    assert.ok(detail.record.readouts.every((readout) => readout.frame?.marked));
    assert.equal(detail.record.personCard?.account, 'U001');
    assert.equal(detail.record.deviceCard?.code, 'F001');
  }

  const integrity = Object.values(app.db.prepare('PRAGMA integrity_check').get())[0];
  const foreignKeyViolations = app.db.prepare('PRAGMA foreign_key_check').all();
  assert.equal(integrity, 'ok');
  assert.equal(foreignKeyViolations.length, 0);

  const durations = tasks.map((task) => Number(task.durationMs || 0));
  const summary = {
    ok: true,
    runs: runCount,
    videoBytes: video.length,
    uploadedBytes: video.length * runCount,
    uploadElapsedMs: Math.round(uploadFinished - started),
    queueElapsedAfterUploadsMs: Math.round(finished - uploadFinished),
    totalWallMs: Math.round(finished - started),
    maxQueued,
    maxRunning,
    uploadMs: {
      median: Math.round(percentile(uploadDurations, 0.5)),
      p95: Math.round(percentile(uploadDurations, 0.95)),
      max: Math.round(Math.max(...uploadDurations)),
    },
    analysisMs: {
      median: Math.round(percentile(durations, 0.5)),
      p95: Math.round(percentile(durations, 0.95)),
      max: Math.round(Math.max(...durations)),
    },
    recordIds: tasks.map((task) => task.recordId),
    integrity,
    foreignKeyViolations: foreignKeyViolations.length,
    temporaryRemaining: existsSync(temporary),
  };
  succeeded = true;
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  if (app) {
    const statuses = app.db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM tasks
      GROUP BY status
      ORDER BY status
    `).all();
    console.error(`db-status-at-failure=${JSON.stringify(statuses)}`);
  }
  throw error;
} finally {
  if (app) await app.close();
  if (succeeded && process.env.KEEP_STRESS_DATA !== '1') {
    rmSync(temporary, { recursive: true, force: true });
  } else {
    console.error(`preserved=${temporary}`);
  }
}
