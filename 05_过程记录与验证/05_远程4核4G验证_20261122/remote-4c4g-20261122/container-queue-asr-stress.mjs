import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const baseUrl = 'http://127.0.0.1:8080';
const video = readFileSync('/test-assets/queue-video.mp4');
const runCount = Number(process.env.STRESS_RUNS || 20);
const chunkSize = 8 * 1024 * 1024;
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
  if (body !== undefined && !Buffer.isBuffer(body) && typeof body !== 'string') {
    body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';', 1)[0];
  return response;
}

async function json(path, options, expected = 200) {
  const response = await request(path, options);
  const payload = await response.json();
  assert.equal(
    response.status,
    expected,
    `${options?.method || 'GET'} ${path}: ${response.status} ${JSON.stringify(payload)}`,
  );
  return payload;
}

async function login() {
  const password = process.env.ACCOUNT_PASSWORD;
  assert.ok(password, 'ACCOUNT_PASSWORD is required');
  const response = await request('/api/auth/login', {
    method: 'POST',
    body: { account: 'U001', password },
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  csrf = payload.csrfToken;
  assert.equal(payload.user.mustChangePassword, false);
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

await login();
const taskIds = [];
const uploadDurations = [];
let maxQueued = 0;
let maxRunning = 0;
const started = performance.now();

for (let run = 1; run <= runCount; run += 1) {
  const uploadStarted = performance.now();
  const init = await json('/api/uploads/init', {
    method: 'POST',
    body: {
      fileName: `queue-asr-${String(run).padStart(2, '0')}.mp4`,
      sizeBytes: video.length,
      startedAt: '2026-09-28 11:05',
      timeConfirmed: true,
      expectedDeviceId: 'F001',
    },
  }, 201);
  let offset = 0;
  let completed;
  while (offset < video.length) {
    const end = Math.min(video.length, offset + chunkSize);
    const chunk = video.subarray(offset, end);
    const response = await request(`/api/uploads/${init.uploadId}/content`, {
      method: 'PUT',
      body: chunk,
      headers: {
        'Upload-Offset': String(offset),
        'Content-Length': String(chunk.length),
      },
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    offset = body.receivedBytes;
    if (offset === video.length) completed = body;
  }
  assert.ok(completed?.taskId);
  taskIds.push(completed.taskId);
  uploadDurations.push(performance.now() - uploadStarted);

  const state = await json('/api/state');
  const active = state.tasks.filter((task) => (
    taskIds.includes(task.id)
      && !['已完成', '失败', '待人工处理', '已取消'].includes(task.status)
  ));
  maxQueued = Math.max(maxQueued, active.filter((task) => task.status === '排队中').length);
  maxRunning = Math.max(maxRunning, active.filter((task) => task.status === '分析中').length);
  if (run % 5 === 0 || run === runCount) {
    console.log(`uploaded=${run}/${runCount} active=${active.length}`);
  }
}

const uploadedAt = performance.now();
let tasks = [];
let lastCompleted = -1;
for (let attempt = 0; attempt < 4800; attempt += 1) {
  const state = await json('/api/state');
  tasks = state.tasks.filter((task) => taskIds.includes(task.id));
  const queued = tasks.filter((task) => task.status === '排队中').length;
  const running = tasks.filter((task) => task.status === '分析中').length;
  maxQueued = Math.max(maxQueued, queued);
  maxRunning = Math.max(maxRunning, running);
  const completedCount = tasks.filter((task) => (
    ['已完成', '失败', '待人工处理', '已取消'].includes(task.status)
  )).length;
  if (completedCount !== lastCompleted) {
    lastCompleted = completedCount;
    console.log(`terminal=${completedCount}/${runCount} queued=${queued} running=${running}`);
  }
  if (tasks.length === runCount && completedCount === runCount) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
const finished = performance.now();

assert.equal(tasks.length, runCount);
assert.ok(tasks.every((task) => task.status === '已完成'),
  tasks.filter((task) => task.status !== '已完成')
    .map((task) => `${task.id}:${task.status}:${task.reason || ''}`).join(', '));
assert.equal(new Set(tasks.map((task) => task.id)).size, runCount);
assert.equal(new Set(tasks.map((task) => task.recordId)).size, runCount);

const details = [];
for (const task of tasks) {
  const detail = await json(`/api/records/${task.recordId}`);
  assert.equal(detail.record.readouts.length, 9);
  assert.ok(detail.record.readouts.every((readout) => readout.screenshot));
  assert.ok(detail.record.readouts.every((readout) => readout.frame?.marked));
  assert.equal(detail.record.speech?.engine, 'whisper.cpp');
  assert.ok(['completed', 'partial', 'no-speech'].includes(detail.record.speech.state));
  details.push({
    taskId: task.id,
    recordId: task.recordId,
    durationMs: Number(task.durationMs || 0),
    speechState: detail.record.speech.state,
    transcriptCount: detail.record.speech.transcript?.length || 0,
    conflictCount: detail.record.speech.sequence?.conflictCount || 0,
    speechElapsedMs: Number(detail.record.speech.elapsedMs || 0),
  });
}

const durations = details.map((item) => item.durationMs);
console.log(JSON.stringify({
  ok: true,
  runs: runCount,
  uploadedBytes: video.length * runCount,
  uploadElapsedMs: Math.round(uploadedAt - started),
  queueElapsedMs: Math.round(finished - uploadedAt),
  totalWallMs: Math.round(finished - started),
  maxQueued,
  maxRunning,
  uploadMs: {
    median: Math.round(percentile(uploadDurations, 0.5)),
    p95: Math.round(percentile(uploadDurations, 0.95)),
    max: Math.round(Math.max(...uploadDurations)),
  },
  taskMs: {
    median: Math.round(percentile(durations, 0.5)),
    p95: Math.round(percentile(durations, 0.95)),
    max: Math.round(Math.max(...durations)),
  },
  speech: {
    completed: details.filter((item) => item.speechState === 'completed').length,
    medianElapsedMs: Math.round(percentile(details.map((item) => item.speechElapsedMs), 0.5)),
    p95ElapsedMs: Math.round(percentile(details.map((item) => item.speechElapsedMs), 0.95)),
    conflictTasks: details.filter((item) => item.conflictCount > 0).length,
  },
  records: details,
}, null, 2));
