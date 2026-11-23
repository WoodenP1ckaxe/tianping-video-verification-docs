import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const baseUrl = 'http://127.0.0.1:8080';
const bigPath = '/app/data/test-media/resume-500mb.mp4';
const smallPath = '/test-assets/queue-video.mp4';
const chunkSize = 8 * 1024 * 1024;

class Client {
  constructor() {
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
    if (body !== undefined && !Buffer.isBuffer(body) && typeof body !== 'string'
      && !(body instanceof ReadableStream)) {
      body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body,
      signal: options.signal,
      duplex: body instanceof ReadableStream ? 'half' : undefined,
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';', 1)[0];
    return response;
  }

  async json(path, options, expected = 200) {
    const response = await this.request(path, options);
    const payload = await response.json();
    assert.equal(
      response.status,
      expected,
      `${options?.method || 'GET'} ${path}: ${response.status} ${JSON.stringify(payload)}`,
    );
    return payload;
  }

  async login(account, password) {
    const payload = await this.json('/api/auth/login', {
      method: 'POST',
      body: { account, password },
    });
    assert.equal(payload.user.mustChangePassword, false);
    this.csrf = payload.csrfToken;
    return payload.user;
  }
}

async function uploadBuffer(client, uploadId, buffer, offset, end) {
  const response = await client.request(`/api/uploads/${uploadId}/content`, {
    method: 'PUT',
    body: buffer.subarray(offset, end),
    headers: {
      'Upload-Offset': String(offset),
      'Content-Length': String(end - offset),
    },
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload;
}

async function interruptedChunk(client, uploadId, buffer, offset, end) {
  const abort = new AbortController();
  const fullLength = end - offset;
  const abortAfter = Math.floor(fullLength * 0.25);
  let delivered = 0;
  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (delivered < fullLength) {
          if (delivered >= abortAfter) {
            abort.abort(new Error('simulated client network disconnect'));
            controller.error(new Error('simulated client network disconnect'));
            return;
          }
          const next = Math.min(fullLength, delivered + 128 * 1024);
          controller.enqueue(buffer.subarray(offset + delivered, offset + next));
          delivered = next;
          await new Promise((resolve) => setTimeout(resolve, 2));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  let error;
  try {
    await client.request(`/api/uploads/${uploadId}/content`, {
      method: 'PUT',
      body: stream,
      signal: abort.signal,
      headers: {
        'Upload-Offset': String(offset),
        'Content-Length': String(fullLength),
      },
    });
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, '中断请求应失败');
  return { delivered, error: String(error.message || error) };
}

const inspector = new Client();
await inspector.login('U001', 'RemoteUpload5678');
const small = readFileSync(smallPath);
const blocker = await inspector.json('/api/uploads/init', {
  method: 'POST',
  body: {
    fileName: 'resume-queue-blocker.mp4',
    sizeBytes: small.length,
    startedAt: '2026-09-28 11:05',
    timeConfirmed: true,
    expectedDeviceId: 'F001',
  },
}, 201);
let blockerTask;
for (let offset = 0; offset < small.length;) {
  const end = Math.min(small.length, offset + chunkSize);
  const payload = await uploadBuffer(inspector, blocker.uploadId, small, offset, end);
  offset = payload.receivedBytes;
  if (offset === small.length) blockerTask = payload;
}
assert.ok(blockerTask?.taskId, '阻断任务未创建');
const blockerDeadline = performance.now() + 120_000;
let blockerState;
while (performance.now() < blockerDeadline) {
  const state = await inspector.json('/api/state');
  blockerState = state.tasks.find((task) => task.id === blockerTask.taskId);
  if (blockerState?.status === '分析中') break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert.equal(blockerState?.status, '分析中', `阻断任务未启动：${blockerState?.status}`);

const bigSize = statSync(bigPath).size;
assert.ok(bigSize <= 500 * 1024 * 1024);
assert.ok(bigSize > 480 * 1024 * 1024);
const big = readFileSync(bigPath);
const uploadStarted = performance.now();
const session = await inspector.json('/api/uploads/init', {
  method: 'POST',
  body: {
    fileName: 'resume-500mb.mp4',
    sizeBytes: big.length,
    startedAt: '2026-09-28 11:05',
    timeConfirmed: true,
    expectedDeviceId: 'F001',
  },
}, 201);
let first = await uploadBuffer(
  inspector,
  session.uploadId,
  big,
  0,
  Math.min(chunkSize, big.length),
);
assert.equal(first.receivedBytes, Math.min(chunkSize, big.length));
const interrupted = await interruptedChunk(
  inspector,
  session.uploadId,
  big,
  first.receivedBytes,
  Math.min(first.receivedBytes + chunkSize, big.length),
);
await new Promise((resolve) => setTimeout(resolve, 1_000));
const afterDisconnect = await inspector.json(`/api/uploads/${session.uploadId}`);
assert.ok(afterDisconnect.receivedBytes >= first.receivedBytes);
assert.ok(afterDisconnect.receivedBytes <= Math.min(first.receivedBytes + chunkSize, big.length),
  '断连后 offset 超出本次分片范围');

let offset = afterDisconnect.receivedBytes;
let finalResponse;
let finalPayload;
while (offset < big.length) {
  const end = Math.min(big.length, offset + chunkSize);
  if (end === big.length) {
    finalResponse = await inspector.request(`/api/uploads/${session.uploadId}/content`, {
      method: 'PUT',
      body: big.subarray(offset, end),
      headers: {
        'Upload-Offset': String(offset),
        'Content-Length': String(end - offset),
      },
    });
    finalPayload = await finalResponse.json();
    offset = finalPayload.receivedBytes || big.length;
  } else {
    const payload = await uploadBuffer(inspector, session.uploadId, big, offset, end);
    offset = payload.receivedBytes;
  }
}
let taskId = null;
let cancelled = null;
let purged = null;
if (finalResponse.status === 200) {
  taskId = finalPayload.taskId;
  assert.ok(taskId, '500 MB 上传未创建任务');
  cancelled = await inspector.json(`/api/tasks/${taskId}/cancel`, {
    method: 'POST',
    body: {},
  });
  assert.equal(cancelled.status, '已取消');
  const admin = new Client();
  await admin.login('U000', 'AdminPass123');
  purged = await admin.json(`/api/tasks/${taskId}/purge`, {
    method: 'POST',
    body: {},
  });
} else {
  assert.equal(finalResponse.status, 422);
  assert.equal(finalPayload.error?.code, 'E_TOO_LONG');
  const uploadState = await inspector.json(`/api/uploads/${session.uploadId}`);
  assert.equal(uploadState.status, '失败');
  assert.equal(uploadState.error?.code, 'E_TOO_LONG');
  const deleted = await inspector.request(`/api/uploads/${session.uploadId}`, {
    method: 'DELETE',
  });
  assert.equal(deleted.status, 200);
}

console.log(JSON.stringify({
  ok: true,
  bytes: big.length,
  mib: Math.round((big.length / 1024 / 1024) * 10) / 10,
  uploadedMs: Math.round(performance.now() - uploadStarted),
  interrupted,
  offsetBeforeDisconnect: first.receivedBytes,
  offsetAfterDisconnect: afterDisconnect.receivedBytes,
  finalHttpStatus: finalResponse.status,
  finalErrorCode: finalPayload.error?.code || null,
  taskId,
  taskStatusAfterCancel: cancelled?.status || null,
  purgeResult: purged,
}, null, 2));
