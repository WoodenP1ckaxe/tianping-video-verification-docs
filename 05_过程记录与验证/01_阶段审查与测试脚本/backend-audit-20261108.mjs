import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from '../server.js';

const root = resolve(import.meta.dirname, '..');
const samplePath = resolve(root, '..', '客户原需求', '测试视频样例', '295ed49aaa4dc37eadf402db4d0b7434.mp4');
const temporary = mkdtempSync(join(tmpdir(), 'tianping-backend-audit-'));
const port = 21000 + Math.floor(Math.random() * 1500);
const baseUrl = `http://127.0.0.1:${port}`;
const results = [];

function record(area, label, pass, expected, actual, severity = 'info') {
  results.push({ area, label, pass, expected, actual, severity });
  console.log(`${pass ? 'PASS' : 'FINDING'} [${area}] ${label}: ${actual}`);
}

function cookieFrom(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return values[0]?.split(';', 1)[0] || '';
}

async function jsonBody(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

class Client {
  constructor() {
    this.cookie = '';
    this.csrf = '';
  }

  async request(path, options = {}) {
    const headers = {
      ...(this.cookie ? { Cookie: this.cookie } : {}),
      ...(this.csrf && options.csrf !== false && options.method && options.method !== 'GET'
        ? { 'X-CSRF-Token': this.csrf }
        : {}),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.rawBody
        ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      redirect: 'manual',
    });
    return {
      response,
      status: response.status,
      headers: response.headers,
      json: () => jsonBody(response),
    };
  }

  async login(account, password) {
    const result = await this.request('/api/auth/login', {
      method: 'POST',
      body: { account, password },
      csrf: false,
    });
    if (result.status === 200) {
      this.cookie = cookieFrom(result.response);
      this.loginBody = await result.json();
      this.csrf = this.loginBody.csrfToken;
    }
    return result;
  }

  async changePassword(currentPassword, newPassword) {
    return this.request('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
  }
}

let app;
try {
  app = await startServer({
    port,
    host: '127.0.0.1',
    dataDir: temporary,
    initialPassword: 'Tp123456',
    workerIntervalMs: 3_600_000,
  });

  const health = await fetch(`${baseUrl}/healthz`);
  const healthBody = await health.json();
  record('health', '健康检查', health.status === 200 && healthBody.database === 'ok', '200/db ok', `${health.status}/${healthBody.database}`);

  const anonymous = new Client();
  const unauth = await anonymous.request('/api/state');
  record('auth', '未登录访问业务 API', unauth.status === 401, 401, unauth.status);

  const staticResponse = await anonymous.request('/');
  const csp = staticResponse.headers.get('content-security-policy') || '';
  record(
    'security-headers',
    '首页安全响应头',
    staticResponse.status === 200
      && staticResponse.headers.get('x-frame-options') === 'DENY'
      && staticResponse.headers.get('x-content-type-options') === 'nosniff'
      && /default-src 'self'/.test(csp)
      && /object-src 'none'/.test(csp),
    '200 + CSP/frame/nosniff',
    `${staticResponse.status}; CSP=${Boolean(csp)}`,
  );
  const etag = staticResponse.headers.get('etag');
  const conditional = await anonymous.request('/', { headers: { 'If-None-Match': etag } });
  record('static', '静态资源 ETag 条件请求', conditional.status === 304, 304, conditional.status);
  const traversal = await anonymous.request('/assets/%2e%2e/%2e%2e/server.js');
  record('static', '编码路径穿越被拒绝', [403, 404].includes(traversal.status), '403/404', traversal.status);

  const existingCaptcha = await anonymous.request('/api/auth/captcha?account=U001');
  const unknownCaptcha = await anonymous.request('/api/auth/captcha?account=NO-SUCH-USER');
  record(
    'auth',
    '验证码接口可区分账号是否存在',
    existingCaptcha.status === unknownCaptcha.status,
    '相同响应',
    `${existingCaptcha.status}/${unknownCaptcha.status}`,
    'medium',
  );

  const failedLoginIds = [];
  let allFailedUnknown = true;
  for (let index = 0; index < 20; index += 1) {
    const id = `NO-RATE-${index}`;
    failedLoginIds.push(id);
    const response = await anonymous.request('/api/auth/login', {
      method: 'POST',
      body: { account: id, password: 'Wrong1234' },
      csrf: false,
    });
    if (response.status !== 401) allFailedUnknown = false;
  }
  const failedAuditCount = app.db.prepare(
    `SELECT COUNT(*) AS n FROM audit_logs
     WHERE type = '登录失败' AND object_id LIKE 'NO-RATE-%'`
  ).get().n;
  record(
    'auth',
    '连续未知账号登录无应用层频控',
    failedAuditCount < 20,
    '发生限流/阻断',
    `${allFailedUnknown ? 20 : '部分'} 次均处理，新增审计 ${failedAuditCount} 条`,
    'medium',
  );

  const inspector = new Client();
  const inspectorLogin = await inspector.login('U001', 'Tp123456');
  const setCookie = inspectorLogin.headers.get('set-cookie') || '';
  record(
    'auth',
    '登录 Cookie 属性',
    inspectorLogin.status === 200 && /HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie),
    '200 + HttpOnly + SameSite',
    `${inspectorLogin.status}; ${setCookie}`,
  );
  record('auth', '首次登录强制改密标记', inspector.loginBody?.user?.mustChangePassword === true, true, inspector.loginBody?.user?.mustChangePassword);
  const changeOne = await inspector.changePassword('Tp123456', 'TpAudit001A');
  record('auth', '首次改密', changeOne.status === 200, 200, changeOne.status);

  const csrfMissing = await inspector.request('/api/auth/logout', {
    method: 'POST',
    body: {},
    csrf: false,
  });
  record('csrf', '缺少 CSRF 令牌的写请求被拒绝', csrfMissing.status === 403, 403, csrfMissing.status);

  const sessionB = new Client();
  const sessionC = new Client();
  record('auth', '改密后登录会话 B', (await sessionB.login('U001', 'TpAudit001A')).status === 200, 200, 200);
  record('auth', '改密后登录会话 C', (await sessionC.login('U001', 'TpAudit001A')).status === 200, 200, 200);
  const changeTwo = await sessionB.changePassword('TpAudit001A', 'TpAudit001B');
  record('auth', '已登录会话再次改密', changeTwo.status === 200, 200, changeTwo.status);
  const staleSession = await sessionC.request('/api/session');
  record(
    'auth',
    '再次改密后其他旧会话仍有效',
    staleSession.status === 401,
    '401（应撤销旧会话）',
    staleSession.status,
    'medium',
  );

  const idleClient = new Client();
  await idleClient.login('U001', 'TpAudit001B');
  const idleToken = decodeURIComponent(idleClient.cookie.split('=').slice(1).join('='));
  app.db.prepare(
    `UPDATE sessions SET last_seen = ?
     WHERE id = ?`
  ).run(Date.now() - 31 * 60_000, idleToken);
  const expiredIdle = await idleClient.request('/api/session');
  record('auth', '会话空闲超时', expiredIdle.status === 401, 401, expiredIdle.status);

  const inspector2 = new Client();
  record('auth', '检验人员 U002 登录', (await inspector2.login('U002', 'Tp123456')).status === 200, 200, 200);
  record('auth', '检验人员 U002 改密', (await inspector2.changePassword('Tp123456', 'TpAudit002A')).status === 200, 200, 200);
  const verifier = new Client();
  record('auth', '复核人员 U003 登录', (await verifier.login('U003', 'Tp123456')).status === 200, 200, 200);
  record('auth', '复核人员 U003 改密', (await verifier.changePassword('Tp123456', 'TpAudit003A')).status === 200, 200, 200);
  const admin = new Client();
  record('auth', '管理员 U000 登录', (await admin.login('U000', 'Tp123456')).status === 200, 200, 200);
  record('auth', '管理员 U000 改密', (await admin.changePassword('Tp123456', 'TpAudit000A')).status === 200, 200, 200);

  const recordsForInspector = await sessionB.request('/api/records?page=1&pageSize=2');
  record('api', '记录分页', recordsForInspector.status === 200, 200, recordsForInspector.status);

  const matrix = [
    ['检验人员访问账号管理', inspector, 'GET', '/api/accounts', 403],
    ['检验人员访问系统状态', inspector, 'GET', '/api/system', 403],
    ['检验人员访问审计日志', inspector, 'GET', '/api/audit', 403],
    ['检验人员新增天平', inspector, 'POST', '/api/devices', 403],
    ['检验人员修改模板', inspector, 'POST', '/api/templates', 403],
    ['检验人员复核记录', inspector, 'POST', '/api/records/20260928-F002-01/confirm', 403],
    ['检验人员作废记录', inspector, 'POST', '/api/records/20260928-F002-01/void', 403],
    ['复核人员访问账号管理', verifier, 'GET', '/api/accounts', 403],
    ['复核人员访问系统状态', verifier, 'GET', '/api/system', 403],
    ['复核人员访问审计日志', verifier, 'GET', '/api/audit', 403],
    ['管理员访问账号管理', admin, 'GET', '/api/accounts', 200],
    ['管理员访问系统状态', admin, 'GET', '/api/system', 200],
    ['管理员访问审计日志', admin, 'GET', '/api/audit', 200],
  ];
  for (const [label, client, method, path, expected] of matrix) {
    const response = await client.request(path, {
      method,
      ...(method === 'POST' ? { body: {} } : {}),
    });
    record('rbac', label, response.status === expected, expected, response.status);
  }

  app.db.prepare(`
    INSERT INTO tasks (
      id, file_name, file_path, size_bytes, user_id, device_id, status,
      started_at, queued_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'U001', 'F001', '失败',
      '2026-09-28 11:05', '2026-09-28 11:06', '2026-09-28 11:06', '2026-09-28 11:06')
  `).run('T-AUDIT-OWNER', 'audit.mp4', samplePath, 1024);
  const ownTask = await sessionB.request('/api/tasks/T-AUDIT-OWNER');
  const otherTask = await inspector2.request('/api/tasks/T-AUDIT-OWNER');
  const verifierTask = await verifier.request('/api/tasks/T-AUDIT-OWNER');
  const ownTaskBody = await ownTask.json();
  record('tasks', '本人可查看任务', ownTask.status === 200, 200, ownTask.status);
  record('tasks', '他人检验人员不可查看任务', otherTask.status === 403, 403, otherTask.status);
  record('tasks', '复核人员可查看全部任务', verifierTask.status === 200, 200, verifierTask.status);
  record('tasks', '任务 DTO 不泄露绝对路径', ownTask.status === 200 && !('filePath' in ownTaskBody), '无 filePath', `${ownTask.status}/${'filePath' in (ownTaskBody || {})}`);

  const taskList = await sessionB.request('/api/tasks');
  const taskListBody = await taskList.json();
  record(
    'tasks',
    '检验人员任务列表仅本人且无路径',
    taskList.status === 200
      && taskListBody.items.every((item) => item.user === 'U001' && !('filePath' in item)),
    '仅 U001 且无路径',
    `${taskList.status}/${taskListBody.items?.length}`,
  );

  const insertQueuedTask = app.db.prepare(`
    INSERT INTO tasks (
      id, file_name, file_path, size_bytes, user_id, status,
      started_at, queued_at, created_at, updated_at
    ) VALUES (?, ?, ?, 1024, 'U001', '排队中', ?, ?, ?, ?)
  `);
  insertQueuedTask.run(
    'T-QUEUE-A',
    'queue-a.mp4',
    samplePath,
    '2026-09-28 12:01',
    '2026-09-28 12:01',
    '2026-09-28 12:01',
    '2026-09-28 12:01',
  );
  insertQueuedTask.run(
    'T-QUEUE-B',
    'queue-b.mp4',
    samplePath,
    '2026-09-28 12:02',
    '2026-09-28 12:02',
    '2026-09-28 12:02',
    '2026-09-28 12:02',
  );
  const firstClaim = app.queue.claimNext();
  const blockedClaim = app.queue.claimNext();
  record(
    'queue',
    '串行队列按 FIFO 领取且仅一个运行任务',
    firstClaim?.id === 'T-QUEUE-A' && blockedClaim === null,
    'T-QUEUE-A/null',
    `${firstClaim?.id}/${blockedClaim?.id || null}`,
  );
  app.db.prepare("UPDATE tasks SET status = '失败' WHERE id = 'T-QUEUE-A'").run();
  const secondClaim = app.queue.claimNext();
  record('queue', '前一任务结束后领取下一项', secondClaim?.id === 'T-QUEUE-B', 'T-QUEUE-B', secondClaim?.id);
  app.queue.recoverInterruptedTasks();
  const recoveredA = app.db.prepare(
    'SELECT status, error_code FROM tasks WHERE id = ?'
  ).get('T-QUEUE-B');
  app.db.prepare("UPDATE tasks SET status = '排队中' WHERE id = 'T-QUEUE-B'").run();
  record(
    'queue',
    '重启恢复将中断任务标记失败',
    recoveredA.status === '失败' && recoveredA.error_code === 'E-RESTARTED',
    '失败/E-RESTARTED',
    `${recoveredA.status}/${recoveredA.error_code}`,
  );
  const queuedSurvivesRestart = app.db.prepare(
    'SELECT status FROM tasks WHERE id = ?'
  ).get('T-QUEUE-B').status;
  record('queue', '重启恢复保留排队任务', queuedSurvivesRestart === '排队中', '排队中', queuedSurvivesRestart);
  const verifierRetryDenied = await verifier.request('/api/tasks/T-AUDIT-OWNER/retry', {
    method: 'POST',
    body: {},
  });
  const adminRetry = await admin.request('/api/tasks/T-AUDIT-OWNER/retry', {
    method: 'POST',
    body: {},
  });
  const retryBody = await adminRetry.json();
  record('queue', '复核人员不能重试任务', verifierRetryDenied.status === 403, 403, verifierRetryDenied.status);
  record(
    'queue',
    '管理员重试失败任务并递增重试次数',
    adminRetry.status === 200 && retryBody.status === '排队中' && retryBody.retryCount === 1,
    '200/排队中/1',
    `${adminRetry.status}/${retryBody.status}/${retryBody.retryCount}`,
  );
  const adminCancel = await admin.request('/api/tasks/T-AUDIT-OWNER/cancel', {
    method: 'POST',
    body: {},
  });
  const cancelBody = await adminCancel.json();
  record(
    'queue',
    '管理员取消排队任务',
    adminCancel.status === 200 && cancelBody.status === '已取消',
    '200/已取消',
    `${adminCancel.status}/${cancelBody.status}`,
  );

  const initPayload = {
    fileName: 'audit-owner.mp4',
    sizeBytes: 1024,
    startedAt: '2026-09-28 12:00',
    timeConfirmed: true,
    expectedDeviceId: 'F001',
  };
  const ownerUpload = await sessionB.request('/api/uploads/init', { method: 'POST', body: initPayload });
  const ownerUploadBody = await ownerUpload.json();
  record('upload', '上传初始化', ownerUpload.status === 201, 201, ownerUpload.status);
  const crossGet = await inspector2.request(`/api/uploads/${ownerUploadBody.uploadId}`);
  const crossDelete = await inspector2.request(`/api/uploads/${ownerUploadBody.uploadId}`, {
    method: 'DELETE',
  });
  record('upload', '跨账号读取上传会话被拒绝', crossGet.status === 403, 403, crossGet.status);
  record('upload', '跨账号取消上传会话被拒绝', crossDelete.status === 403, 403, crossDelete.status);
  const ownerCancel = await sessionB.request(`/api/uploads/${ownerUploadBody.uploadId}`, {
    method: 'DELETE',
  });
  record('upload', '本人取消上传会话', ownerCancel.status === 200, 200, ownerCancel.status);

  const resumeInit = await sessionB.request('/api/uploads/init', {
    method: 'POST',
    body: { ...initPayload, fileName: 'resume-audit.mp4', sizeBytes: 10 },
  });
  const resumeUpload = await resumeInit.json();
  const firstChunk = await sessionB.request(`/api/uploads/${resumeUpload.uploadId}/content`, {
    method: 'PUT',
    rawBody: Buffer.from('abcde'),
    headers: { 'Upload-Offset': '0', 'Content-Length': '5' },
  });
  const firstChunkBody = await firstChunk.json();
  record(
    'upload',
    '分片上传保存续传偏移',
    firstChunk.status === 200 && firstChunkBody.receivedBytes === 5,
    '200/5',
    `${firstChunk.status}/${firstChunkBody.receivedBytes}`,
  );
  const offsetConflict = await sessionB.request(`/api/uploads/${resumeUpload.uploadId}/content`, {
    method: 'PUT',
    rawBody: Buffer.from('xyz'),
    headers: { 'Upload-Offset': '0', 'Content-Length': '3' },
  });
  record('upload', '错误续传偏移被拒绝', offsetConflict.status === 409, 409, offsetConflict.status);
  const finalChunk = await sessionB.request(`/api/uploads/${resumeUpload.uploadId}/content`, {
    method: 'PUT',
    rawBody: Buffer.from('fghij'),
    headers: { 'Upload-Offset': '5', 'Content-Length': '5' },
  });
  const finalChunkBody = await finalChunk.json();
  record(
    'upload',
    '非法媒体返回可理解的客户端错误',
    finalChunk.status >= 400 && finalChunk.status < 500 && finalChunkBody?.error?.code !== 'INTERNAL_ERROR',
    '4xx + 具体错误码',
    `${finalChunk.status}/${finalChunkBody?.error?.code}`,
    'medium',
  );
  const failedUploadState = await sessionB.request(`/api/uploads/${resumeUpload.uploadId}`);
  const failedUploadStateBody = await failedUploadState.json();
  record(
    'upload',
    '媒体校验失败持久化任务原因',
    failedUploadStateBody.status === '失败' && failedUploadStateBody.error?.code === 'E_VIDEO_CORRUPT',
    '失败/E_VIDEO_CORRUPT',
    `${failedUploadStateBody.status}/${failedUploadStateBody.error?.code}`,
  );
  const cancelFailedUpload = await sessionB.request(`/api/uploads/${resumeUpload.uploadId}`, {
    method: 'DELETE',
  });
  record('upload', '失败上传可取消并释放会话', cancelFailedUpload.status === 200, 200, cancelFailedUpload.status);

  const badExtension = await sessionB.request('/api/uploads/init', {
    method: 'POST',
    body: { ...initPayload, fileName: 'virus.exe' },
  });
  record('upload', '非视频扩展名被拒绝', badExtension.status === 415, 415, badExtension.status);
  const tooLarge = await sessionB.request('/api/uploads/init', {
    method: 'POST',
    body: { ...initPayload, sizeBytes: 500 * 1024 * 1024 + 1 },
  });
  record('upload', '超 500MB 声明被拒绝', tooLarge.status === 413, 413, tooLarge.status);
  const badDevice = await sessionB.request('/api/uploads/init', {
    method: 'POST',
    body: { ...initPayload, expectedDeviceId: 'NO-DEVICE' },
  });
  record('upload', '不存在天平被拒绝', badDevice.status === 400, 400, badDevice.status);
  const traversalName = await sessionB.request('/api/uploads/init', {
    method: 'POST',
    body: { ...initPayload, fileName: '..\\..\\evil.mp4' },
  });
  const traversalBody = await traversalName.json();
  record(
    'upload',
    '上传文件名目录部分被移除',
    traversalName.status === 201 && traversalBody.fileName === 'evil.mp4',
    'evil.mp4',
    `${traversalName.status}/${traversalBody.fileName}`,
  );
  if (traversalName.status === 201) {
    await sessionB.request(`/api/uploads/${traversalBody.uploadId}`, { method: 'DELETE' });
  }
  const invalidDate = await sessionB.request('/api/uploads/init', {
    method: 'POST',
    body: { ...initPayload, fileName: 'invalid-date.mp4', startedAt: '2026-02-31 10:00' },
  });
  record(
    'validation',
    '不存在的日历日期被接受',
    invalidDate.status === 400,
    '400',
    invalidDate.status,
    'medium',
  );
  const invalidDateBody = await invalidDate.json();
  if (invalidDate.status === 201) {
    await sessionB.request(`/api/uploads/${invalidDateBody.uploadId}`, { method: 'DELETE' });
  }

  const dateFilter = await sessionB.request('/api/records?from=2026-02-31&to=2026-02-31');
  record(
    'validation',
    '记录查询接受不存在的日历日期',
    dateFilter.status === 400,
    '400',
    dateFilter.status,
    'low',
  );
  const infinityPage = await sessionB.request('/api/records?page=1e309&pageSize=2');
  const infinityPageBody = await infinityPage.json();
  record(
    'validation',
    '分页参数 Infinity 被归一化',
    Number.isFinite(infinityPageBody.page),
    '有限正整数',
    `${infinityPage.status}/page=${JSON.stringify(infinityPageBody.page)}`,
    'low',
  );

  const disabledDictionary = await admin.request('/api/dictionaries', {
    method: 'POST',
    body: {
      category: 'department',
      value: '审计停用科室',
      label: '审计停用科室',
      status: '停用',
      sortOrder: 500,
    },
  });
  const disabledDictionaryBody = await disabledDictionary.json();
  const partialDictionary = await admin.request(`/api/dictionaries/${disabledDictionaryBody.id}`, {
    method: 'PATCH',
    body: { label: '审计局部修改' },
  });
  const partialDictionaryBody = await partialDictionary.json();
  record(
    'patch',
    '数据字典局部 PATCH 保持未提供状态',
    partialDictionaryBody.status === '停用',
    '停用',
    `${partialDictionary.status}/${partialDictionaryBody.status}`,
    'low',
  );

  const disabledBox = await admin.request('/api/weight-boxes', {
    method: 'POST',
    body: { id: 'AUDITBOX', status: '停用', remark: '审计' },
  });
  const disabledBoxBody = await disabledBox.json();
  const partialBox = await admin.request('/api/weight-boxes/AUDITBOX', {
    method: 'PATCH',
    body: { remark: '局部修改' },
  });
  const partialBoxBody = await partialBox.json();
  record(
    'patch',
    '砝码盒局部 PATCH 保持未提供状态',
    partialBoxBody.status === '停用',
    '停用',
    `${partialBox.status}/${partialBoxBody.status}`,
    'low',
  );

  const templateState = await verifier.request('/api/templates');
  const template = (await templateState.json()).current;
  const malformedTemplate = await verifier.request('/api/templates', {
    method: 'POST',
    body: {
      config: {
        ...template,
        fields: [null],
      },
      summary: '后端审计：畸形字段数组',
    },
  });
  record(
    'validation',
    '模板字段数组元素为非对象时被拒绝',
    malformedTemplate.status === 400,
    '400',
    malformedTemplate.status,
    'medium',
  );

  const oversizedBody = await verifier.request('/api/templates', {
    method: 'POST',
    rawBody: JSON.stringify({ config: { fields: ['x'], footerExtra: 'x'.repeat(2 * 1024 * 1024) } }),
    headers: { 'Content-Type': 'application/json' },
  });
  record('validation', '超过 2MB JSON 被拒绝', oversizedBody.status === 413, 413, oversizedBody.status);

  const smallVideo = join(temporary, 'range-test.mp4');
  writeFileSync(smallVideo, Buffer.from('0123456789'));
  app.db.prepare('UPDATE tasks SET file_path = ? WHERE id = ?')
    .run(smallVideo, 'T-20260928-002');
  const suffixRange = await sessionB.request(
    '/api/records/20260928-F001-01/video',
    { headers: { Range: 'bytes=-5' } },
  );
  const suffixBytes = Buffer.from(await suffixRange.response.arrayBuffer()).toString();
  record(
    'video',
    'HTTP 后缀 Range 返回文件末尾字节',
    suffixRange.status === 206 && suffixBytes === '56789',
    '206/56789',
    `${suffixRange.status}/${suffixBytes}`,
    'low',
  );
  const badRange = await sessionB.request(
    '/api/records/20260928-F001-01/video',
    { headers: { Range: 'bytes=abc' } },
  );
  record('video', '非法 Range 被拒绝', badRange.status === 416, 416, badRange.status);

  const malformedUri = await sessionB.request('/api/qr/device/%E0%A4%A.svg');
  record(
    'errors',
    '畸形百分号编码返回客户端错误',
    malformedUri.status === 400,
    '400',
    malformedUri.status,
    'low',
  );

  const auditUpdateBlocked = (() => {
    try {
      app.db.prepare("UPDATE audit_logs SET reason = 'tampered' WHERE id = 1").run();
      return false;
    } catch {
      return true;
    }
  })();
  const auditDeleteBlocked = (() => {
    try {
      app.db.prepare('DELETE FROM audit_logs WHERE id = 1').run();
      return false;
    } catch {
      return true;
    }
  })();
  record('database', '审计日志禁止更新', auditUpdateBlocked, true, auditUpdateBlocked);
  record('database', '审计日志禁止删除', auditDeleteBlocked, true, auditDeleteBlocked);
  const integrity = app.db.prepare('PRAGMA integrity_check').get();
  const fk = app.db.prepare('PRAGMA foreign_keys').get();
  record(
    'database',
    '数据库完整性与外键',
    Object.values(integrity)[0] === 'ok' && Object.values(fk)[0] === 1,
    'ok/1',
    `${Object.values(integrity)[0]}/${Object.values(fk)[0]}`,
  );
  record('database', 'WAL 日志模式', String(app.db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase() === 'wal', 'wal', app.db.prepare('PRAGMA journal_mode').get().journal_mode);

  const backupResponse = await admin.request('/api/system/backup', {
    method: 'POST',
    body: {},
  });
  const backup = await backupResponse.json();
  const backupPath = join(temporary, 'backups', backup.file || '');
  let backupIntegrity = null;
  if (backup.file && existsSync(backupPath)) {
    const backupDb = new DatabaseSync(backupPath, { readOnly: true });
    try {
      backupIntegrity = Object.values(backupDb.prepare('PRAGMA integrity_check').get())[0];
      const userCount = backupDb.prepare('SELECT COUNT(*) AS n FROM users').get().n;
      record(
        'backup',
        '运行中 API 备份可读且保留业务数据',
        backupResponse.status === 201 && backupIntegrity === 'ok' && userCount >= 3,
        '201/ok/用户已保留',
        `${backupResponse.status}/${backupIntegrity}/${userCount}`,
      );
    } finally {
      backupDb.close();
    }
  } else {
    record('backup', '运行中 API 备份文件生成', false, '备份文件存在', `${backupResponse.status}/${backup.file}`);
  }

  const selfDisable = await admin.request('/api/accounts/U000', {
    method: 'PATCH',
    body: { id: 'U000', name: '系统管理员', role: 'admin', status: '停用' },
  });
  record('accounts', '管理员不能停用自己', selfDisable.status === 409, 409, selfDisable.status);
  const disableU002 = await admin.request('/api/accounts/U002', {
    method: 'PATCH',
    body: { id: 'U002', name: '检验人员 2', role: 'inspector', status: '停用' },
  });
  const disabledSession = await inspector2.request('/api/session');
  record('accounts', '停用账号后既有会话立即失效', disableU002.status === 200 && disabledSession.status === 401, '200/401', `${disableU002.status}/${disabledSession.status}`);

  const summary = {
    total: results.length,
    passed: results.filter((item) => item.pass).length,
    findings: results.filter((item) => !item.pass).length,
    bySeverity: Object.fromEntries(
      ['medium', 'low'].map((severity) => [
        severity,
        results.filter((item) => !item.pass && item.severity === severity).length,
      ])
    ),
    results,
  };
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({
    total: summary.total,
    passed: summary.passed,
    findings: summary.findings,
    bySeverity: summary.bySeverity,
  }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
}
