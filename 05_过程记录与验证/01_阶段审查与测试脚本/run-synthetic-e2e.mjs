import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from '../server.js';

const root = resolve(import.meta.dirname);
const sampleRoot = join(root, 'synthetic-samples');
const dataDir = join(root, `synthetic-e2e-data-${randomUUID().slice(0, 8)}`);
const initialPassword = 'TpSynth1234';
const changedPassword = 'TpSynthNew1234';

function cookieFrom(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return values[0]?.split(';', 1)[0] || '';
}

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookie = '';
    this.csrf = '';
  }

  async request(path, options = {}) {
    const body = options.raw ?? (options.body ? JSON.stringify(options.body) : undefined);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        ...(body ? { 'Content-Type': options.raw ? 'application/octet-stream' : 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(this.csrf && !['GET', 'HEAD'].includes(options.method || 'GET')
          ? { 'X-CSRF-Token': this.csrf }
          : {}),
        ...(options.headers || {})
      },
      body
    });
    return response;
  }

  async expect(path, expected, options = {}) {
    const response = await this.request(path, options);
    if (response.status !== expected) {
      throw new Error(`${path} HTTP ${response.status}，预期 ${expected}：${await response.text()}`);
    }
    return response;
  }

  async login(account) {
    const response = await this.expect('/api/auth/login', 200, {
      method: 'POST',
      body: { account, password: initialPassword }
    });
    this.cookie = cookieFrom(response);
    const login = await response.json();
    this.csrf = login.csrfToken;
    await this.expect('/api/auth/change-password', 200, {
      method: 'POST',
      body: {
        currentPassword: initialPassword,
        newPassword: changedPassword
      }
    });
  }
}

async function waitTask(client, taskId) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const response = await client.expect(`/api/tasks/${encodeURIComponent(taskId)}`, 200);
    const task = await response.json();
    if (['已完成', '失败', '待人工处理'].includes(task.status)) return task;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error(`任务 ${taskId} 在 48 秒内未结束`);
}

async function upload(client, fileName, startedAt, expectedDeviceId) {
  const file = readFileSync(join(sampleRoot, fileName));
  const init = await client.expect('/api/uploads/init', 201, {
    method: 'POST',
    body: {
      fileName,
      sizeBytes: file.length,
      startedAt,
      timeConfirmed: false,
      expectedDeviceId
    }
  });
  const uploadInfo = await init.json();
  let offset = 0;
  let completed;
  const chunkSize = 8 * 1024 * 1024;
  while (offset < file.length) {
    const end = Math.min(file.length, offset + chunkSize);
    const chunk = file.subarray(offset, end);
    const response = await client.expect(
      `/api/uploads/${encodeURIComponent(uploadInfo.uploadId)}/content`,
      200,
      {
        method: 'PUT',
        raw: chunk,
        headers: {
          'Upload-Offset': String(offset),
          'Content-Length': String(chunk.length)
        }
      }
    );
    completed = await response.json();
    offset = completed.receivedBytes;
  }
  assert.equal(completed.status, '已完成');
  assert.equal(completed.timeConfirmed, false, '有 creation_time 时不应强制人工确认');
  const task = await waitTask(client, completed.taskId);
  return { upload: completed, task };
}

async function recordDetail(client, task) {
  if (!task.recordId) return null;
  return (await client.expect(`/api/records/${encodeURIComponent(task.recordId)}`, 200)).json();
}

mkdirSync(dataDir, { recursive: true });
const port = 18200 + Math.floor(Math.random() * 500);
let app;

try {
  app = await startServer({
    port,
    host: '127.0.0.1',
    dataDir,
    initialPassword,
    workerIntervalMs: 80
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const u001 = new ApiClient(baseUrl);
  const u002 = new ApiClient(baseUrl);
  const u003 = new ApiClient(baseUrl);
  await u001.login('U001');
  await u002.login('U002');
  await u003.login('U003');

  const single = await upload(
    u001,
    'synthetic-single-F001-U001.mp4',
    '2026-11-01 18:00',
    'F001'
  );
  assert.equal(single.task.status, '已完成', single.task.reason);
  const singleDetail = await recordDetail(u001, single.task);
  assert.equal(singleDetail.evaluation.conclusion, '通过');
  assert.equal(singleDetail.record.personCard.account, 'U001');
  assert.equal(singleDetail.record.deviceCard.code, 'F001');
  assert.equal(singleDetail.record.startTime, '2026-09-28 08:31');
  assert.ok(singleDetail.record.readouts.every((item) => item.screenshot));

  for (const key of ['SP:cleanliness', 'SP:level', 'SP:internalCal']) {
    await u001.expect(
      `/api/records/${encodeURIComponent(single.task.recordId)}/check/${encodeURIComponent(key)}`,
      200,
      {
        method: 'POST',
        body: { reason: '合成样例端到端核对' }
      }
    );
  }
  await u001.expect(
    `/api/records/${encodeURIComponent(single.task.recordId)}/submit`,
    200,
    { method: 'POST', body: {} }
  );
  await u003.expect(
    `/api/records/${encodeURIComponent(single.task.recordId)}/confirm`,
    200,
    { method: 'POST', body: {} }
  );

  const dual = await upload(
    u002,
    'synthetic-dual-F002-U002.mp4',
    '2026-11-01 18:10',
    'F002'
  );
  assert.equal(dual.task.status, '已完成', dual.task.reason);
  const dualDetail = await recordDetail(u002, dual.task);
  assert.equal(dualDetail.evaluation.conclusion, '不通过');
  assert.equal(dualDetail.record.personCard.account, 'U002');
  assert.equal(dualDetail.record.deviceCard.code, 'F002');
  assert.equal(dualDetail.record.rangeSwitch, true);
  assert.equal(dualDetail.record.rangeTransition.detected, true);
  assert.ok(dualDetail.record.readouts.every((item) => item.value !== null));
  assert.ok(dualDetail.record.readouts.every((item) => item.screenshot));

  const personConflict = await upload(
    u002,
    'synthetic-single-F001-U001.mp4',
    '2026-11-01 18:20',
    'F001'
  );
  assert.equal(personConflict.task.status, '待人工处理');
  assert.equal(personConflict.task.recordId, null);
  assert.match(personConflict.task.reason, /人员卡与登录人员不一致/);

  const deviceConflict = await upload(
    u001,
    'synthetic-device-conflict-F002-U001.mp4',
    '2026-11-01 18:30',
    'F002'
  );
  assert.equal(deviceConflict.task.status, '待人工处理');
  assert.equal(deviceConflict.task.recordId, null);
  assert.match(deviceConflict.task.reason, /设备卡识别为 F002|未生成正式记录/);

  const result = {
    generatedAt: new Date().toISOString(),
    samples: {
      single: {
        task: single.task.id,
        record: single.task.recordId,
        conclusion: singleDetail.evaluation.conclusion,
        personCard: singleDetail.record.personCard,
        deviceCard: singleDetail.record.deviceCard,
        effectiveStartTime: singleDetail.record.startTime,
        screenshots: singleDetail.record.readouts.filter((item) => item.screenshot).length
      },
      dual: {
        task: dual.task.id,
        record: dual.task.recordId,
        conclusion: dualDetail.evaluation.conclusion,
        rangeTransition: dualDetail.record.rangeTransition,
        screenshots: dualDetail.record.readouts.filter((item) => item.screenshot).length
      },
      personConflict: {
        task: personConflict.task.id,
        status: personConflict.task.status,
        reason: personConflict.task.reason
      },
      deviceConflict: {
        task: deviceConflict.task.id,
        status: deviceConflict.task.status,
        reason: deviceConflict.task.reason
      }
    }
  };
  writeFileSync(
    join(root, 'synthetic-e2e-result.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (app) await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}
