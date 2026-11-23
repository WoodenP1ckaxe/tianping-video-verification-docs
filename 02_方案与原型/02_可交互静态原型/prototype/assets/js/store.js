/* ==========================================================================
   store.js — 前端内存状态与业务动作（原型模拟，无后端、无持久化）
   刷新浏览器即恢复初始数据。
   ========================================================================== */
(function () {
  'use strict';

  var APP = window.APP;
  var T = APP.time;
  var R = APP.Rules;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- 权限矩阵（FR-105、4.1） ---------------- */
  var PERM = {
    admin: ['tasks.all', 'task.manage', 'records.all', 'export', 'masterdata', 'template', 'accounts', 'audit', 'system', 'void', 'print.blank'],
    inspector: ['upload', 'tasks.own', 'records.all', 'export', 'review.own'],
    verifier: ['verify', 'tasks.read', 'records.all', 'export', 'masterdata', 'template', 'print.blank']
  };

  var state = {
    user: null,
    showTrace: true,
    route: '/login',
    records: clone(APP.records),
    tasks: clone(APP.tasks),
    accounts: clone(APP.accounts),
    devices: clone(APP.devices),
    weightBoxes: clone(APP.weightBoxes),
    audit: clone(APP.audit),
    template: clone(APP.template),
    templateVersions: clone(APP.templateVersions),
    exports: clone(APP.exports),
    storage: clone(APP.storage),
    backups: clone(APP.backups),
    queue: clone(APP.queue),
    checked: {},
    modal: null,
    toast: null,
    player: { recordId: null, key: null },
    upload: null,
    loginFail: 0,
    locked: false,
    virtualMin: 9 * 60 + 52,
    sessionEvents: 0,
    filter: { records: { device: '', from: '', to: '', inspector: '', conclusion: '', status: '', page: 1, size: 8 } }
  };

  function now() {
    var d = new Date(2026, 8, 28, Math.floor(state.virtualMin / 60), state.virtualMin % 60);
    return T.fmtMin(d);
  }

  function tick(min) {
    state.virtualMin += (min || 0);
    return now();
  }

  /* ---------------- 查询 ---------------- */
  function acc(id) { return state.accounts.filter(function (a) { return a.id === id; })[0] || null; }
  function dev(id) { return state.devices.filter(function (d) { return d.id === id; })[0] || null; }
  function rec(id) { return state.records.filter(function (r) { return r.id === id; })[0] || null; }
  function task(id) { return state.tasks.filter(function (t) { return t.id === id; })[0] || null; }

  function name(id) { var a = acc(id); return a ? a.name : id; }
  function roleLabel(role) { return (APP.ROLES[role] || {}).label || role; }

  function can(feature) {
    if (!state.user) return false;
    return (PERM[state.user.role] || []).indexOf(feature) >= 0;
  }

  /* ---------------- 审计 ---------------- */
  function auditEvent(type, objType, obj, before, after, reason) {
    var u = state.user;
    var ev = {
      id: 'AU-S' + (++state.sessionEvents) + '-' + Math.random().toString(36).slice(2, 6),
      time: now(),
      account: u ? u.id : '系统',
      name: u ? u.name : '系统',
      role: u ? roleLabel(u.role) : '系统自动',
      type: type, objType: objType, obj: obj,
      before: before || '', after: after || '', reason: reason || '',
      ip: u ? (u.role === 'inspector' ? '10.20.3.51' : u.role === 'verifier' ? '10.20.3.44' : '10.20.3.10') : '127.0.0.1',
      result: '成功', session: true
    };
    state.audit.unshift(ev);
    return ev;
  }

  /* ---------------- 登录与会话（FR-104、FR-106、FR-109） ---------------- */
  function login(id, silent) {
    var a = acc(id);
    if (!a) return { ok: false, msg: '账号不存在' };
    if (a.status === '停用') {
      auditEvent('登录失败', '账号', id, '', '', '账号已停用，拒绝登录（FR-109）');
      return { ok: false, msg: '该账号已停用，无法登录。停用账号的历史操作与记录保持不变（FR-109）。' };
    }
    if (state.locked) {
      return { ok: false, msg: '账号已锁定，请于 10 分钟后重试（FR-104）。' };
    }
    state.loginFail = 0;
    state.user = a;
    a.lastLogin = now();
    auditEvent('登录成功', '账号', id, '', '', a.firstLogin ? '首次登录，需强制修改口令' : '');
    return { ok: true, firstLogin: !!a.firstLogin };
  }

  function loginManual(id, pwd) {
    var a = acc(id);
    if (!a) return { ok: false, msg: '账号不存在，请检查后重试。' };
    if (a.status === '停用') return login(id);
    if (pwd !== a.pwd) {
      state.loginFail++;
      auditEvent('登录失败', '账号', id, '', '', '口令错误（第 ' + state.loginFail + ' 次）');
      if (state.loginFail >= 5) {
        state.locked = true;
        auditEvent('账号锁定', '账号', id, '启用', '锁定 10 分钟', '连续 5 次口令错误（FR-104）');
        return { ok: false, msg: '连续 5 次口令错误，账号已锁定 10 分钟（FR-104）。' };
      }
      return { ok: false, msg: '口令错误（第 ' + state.loginFail + ' 次 / 共 5 次），连续 5 次将锁定账号 10 分钟。' };
    }
    return login(id);
  }

  function changePwd(id, pwd) {
    var a = acc(id);
    if (!a) return { ok: false, msg: '账号不存在' };
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(pwd)) {
      return { ok: false, msg: '口令长度不少于 8 位且必须同时包含字母与数字（FR-104）。' };
    }
    a.pwd = pwd;
    a.firstLogin = false;
    auditEvent('口令修改', '账号', id, '', '已修改', '首次登录强制修改口令');
    return { ok: true };
  }

  function logout(reason) {
    if (state.user) auditEvent('登出', '账号', state.user.id, '', '', reason || '用户主动退出');
    state.user = null;
    state.player = { recordId: null, key: null };
  }

  function switchUser(id) {
    if (state.user) auditEvent('登出', '账号', state.user.id, '', '', '切换演示账号（原型专用）');
    var r = login(id);
    return r;
  }

  /* ---------------- 记录与任务 ---------------- */
  function newRecordId(deviceId, date) {
    var d = (date || now().slice(0, 10)).replace(/-/g, '');
    var n = state.records.filter(function (r) {
      return r.device === deviceId && r.id.indexOf(d + '-' + deviceId) === 0;
    }).length + 1;
    return d + '-' + deviceId + '-' + (n < 10 ? '0' + n : n);
  }

  function queueList() {
    return state.tasks.filter(function (t) { return t.status === '排队中'; })
      .sort(function (a, b) { return a.queuedAt < b.queuedAt ? -1 : 1; });
  }

  function queuePos(taskId) {
    var q = queueList();
    for (var i = 0; i < q.length; i++) if (q[i].id === taskId) return i + 1;
    return null;
  }

  function analyzingTask() {
    return state.tasks.filter(function (t) { return t.status === '分析中'; })[0] || null;
  }

  /** 按场景生成一次分析的识别结果（原型固定模板，保证演示可重复） */
  function buildReadouts(device, scenario) {
    var out = [];
    for (var p = 0; p < 3; p++) {
      var L = device.points[p];
      var range = device.ranges === 2 ? (device.pointRange[p] || (p === 0 ? 1 : 2)) : 1;
      var dec = R.decimalsOf(device, range);
      for (var i = 0; i < 3; i++) {
        var delta = [0.00003, -0.00002, 0.00001, -0.00004, 0.00002, 0.00003, -0.00001, 0.00004, -0.00003][p * 3 + i] * L;
        var v = R.rnd(L + delta, dec);
        if (scenario === 'fail' && p === 0 && i === 1) v = R.rnd(L + 0.00169 * L, dec);
        out.push({
          point: p, idx: i + 1, value: v, unit: 'g', off: 32 + (p * 3 + i) * 39,
          conf: scenario === 'fail' && p === 0 && i === 1 ? 0.91 : 0.994,
          stable: true, range: range
        });
      }
    }
    return out;
  }

  function createUploadTask(opt) {
    var id = 'T-' + now().slice(0, 10).replace(/-/g, '') + '-' + ('0' + (state.tasks.filter(function (t) {
      return t.id.indexOf('T-' + now().slice(0, 10).replace(/-/g, '')) === 0;
    }).length + 1)).slice(-3);
    var t = {
      id: id, file: opt.file, size: opt.size, device: opt.device || null, user: state.user.id,
      status: '排队中', queuedAt: now(), startedAt: null, finishedAt: null,
      recordId: null, code: null, reason: null, source: opt.source || 'PC-Chrome / 10.20.3.51',
      scenario: opt.scenario || 'pass', startTime: opt.startTime || now()
    };
    state.tasks.unshift(t);
    auditEvent('视频上传', '分析任务', id, '', '排队中',
      '文件名 ' + opt.file + '（' + opt.size + 'MB）；拍摄开始时间 ' + t.startTime + '；SHA-256 校验值已计算（FR-408）');
    return t;
  }

  /** 推进一步：无分析中任务 → 启动队首；有分析中任务 → 完成并生成记录 */
  function advanceQueue() {
    var cur = analyzingTask();
    if (cur) {
      var mins = 12 + Math.round(Math.random() * 4);
      tick(mins);
      cur.finishedAt = now();
      if (cur.scenario === 'nocard') {
        cur.status = '待人工处理';
        cur.code = 'E-1002';
        cur.reason = '未识别到人员卡 / 设备卡镜头，未生成正式记录，请补拍含清晰卡面（正面停留 ≥2 秒）的视频后重新上传（FR-604）';
        auditEvent('分析完成', '分析任务', cur.id, '分析中', '待人工处理', cur.reason);
        return { step: '完成（待人工处理）', task: cur, record: null };
      }
      if (cur.scenario === 'failtask') {
        cur.status = '失败';
        cur.code = 'E-2001';
        cur.reason = '视频文件损坏或编码不受支持：检测到 HEVC/H.265 编码，请先转码为标准 H.264 后重新上传（FR-402）';
        auditEvent('分析失败', '分析任务', cur.id, '分析中', '失败', cur.reason);
        return { step: '完成（失败）', task: cur, record: null };
      }
      var device = dev(cur.device) || state.devices[0];
      var r = {
        id: newRecordId(device.id),
        date: now().slice(0, 10),
        device: device.id,
        inspector: cur.user,
        box: device.defaultBox,
        startTime: cur.startTime,
        duration: 360 + Math.round(Math.random() * 60),
        file: cur.file, fileSize: cur.size, sha: 'new' + Math.random().toString(16).slice(2, 10),
        status: '待提交',
        cleanliness: '是', level: '是', internalCal: device.internalCal === 'NA' ? 'NA' : '是',
        remark: '无',
        readouts: buildReadouts(device, cur.scenario === 'fail' ? 'fail' : 'pass'),
        rangeSwitch: true,
        personCard: { account: cur.user, conf: 0.997 },
        deviceCard: { code: device.qrValue, conf: 0.996 },
        speech: { cleanliness: { v: '是', conf: 0.93 }, level: { v: '是', conf: 0.95 } },
        modifications: [],
        analyzedAt: now(), taskId: cur.id
      };
      state.records.unshift(r);
      cur.status = '已完成';
      cur.recordId = r.id;
      var ev = R.evaluate(r, device);
      auditEvent('分析完成', '分析任务', cur.id, '分析中', '已完成',
        '生成待提交记录 ' + r.id + '，判定"' + ev.conclusion + '"' +
        (ev.conclusion === '不通过' ? '（' + ev.reasons.map(function (x) { return x.label; }).join('、') + '）' : ''));
      return { step: '完成（生成记录）', task: cur, record: r };
    }
    var q = queueList();
    if (!q.length) return { step: '队列为空', task: null, record: null };
    cur = q[0];
    tick(1);
    cur.status = '分析中';
    cur.startedAt = now();
    auditEvent('任务状态变化', '分析任务', cur.id, '排队中', '分析中', '队列位置 1，开始分析');
    return { step: '开始分析', task: cur, record: null };
  }

  function cancelTask(id) {
    var t = task(id);
    if (!t || t.status !== '排队中') return { ok: false, msg: '仅"排队中"的任务可取消（FR-410）。' };
    t.status = '已取消';
    auditEvent('上传取消', '分析任务', id, '排队中', '已取消', '管理员取消排队任务');
    return { ok: true };
  }

  function retryTask(id) {
    var t = task(id);
    if (!t) return { ok: false, msg: '任务不存在' };
    if (t.status !== '失败' && t.status !== '待人工处理') {
      return { ok: false, msg: '仅"失败"或"待人工处理"的任务可重试（FR-504）。' };
    }
    t.status = '排队中';
    t.queuedAt = now();
    t.startedAt = null;
    t.finishedAt = null;
    t.code = null;
    t.reason = null;
    t.scenario = t.scenario && t.scenario !== 'failtask' ? t.scenario : 'pass';
    auditEvent('任务状态变化', '分析任务', id, '失败', '排队中', '人工重试，不产生重复记录（FR-504）');
    return { ok: true };
  }

  function mine(id) { return state.user && state.user.id === id; }

  /* ---------------- 字段修改与留痕（FR-806、FR-807） ---------------- */
  function editable(record) {
    return record.status === '待提交';
  }

  function updateReadout(recordId, key, value, reason) {
    var r = rec(recordId);
    if (!r) return { ok: false, msg: '记录不存在' };
    if (!editable(r)) return { ok: false, msg: '仅"待提交"状态的记录可修正识别结果（FR-808）。' };
    var d = dev(r.device);
    var ev = R.evaluate(r, d);
    var it = ev.items.filter(function (x) { return x.key === key; })[0];
    if (!it) return { ok: false, msg: '读数不存在' };
    var before = it.value === null ? '（缺次）' : R.fmt(it.value, it.dec);
    r.readouts.forEach(function (ro) {
      if (R.readoutKey(ro) === key) {
        ro.value = (value === '' || value === null || isNaN(Number(value))) ? null : Number(value);
        if (ro.value !== null) ro.conf = 0.999;
      }
    });
    R.markChecked(r, 'RO:' + key);
    var after = r.readouts.filter(function (ro) { return R.readoutKey(ro) === key; })[0];
    var afterTxt = after.value === null ? '（缺次）' : R.fmt(after.value, it.dec);
    r.modifications.push({
      field: '测量示值(' + key + ')', before: before, after: afterTxt,
      by: state.user.id, at: now(), reason: reason || '（未填写）', stage: r.status
    });
    auditEvent('字段修改', '校验记录', recordId, before, afterTxt, reason || '未填写理由');
    return { ok: true, before: before, after: afterTxt };
  }

  function markReadoutChecked(recordId, key) {
    var r = rec(recordId);
    if (!r) return { ok: false, msg: '记录不存在' };
    R.markChecked(r, 'RO:' + key);
    auditEvent('字段核对', '校验记录', recordId, '', key + ' 标记为已核对', '低置信字段人工核对确认（FR-612）');
    return { ok: true };
  }

  function markSpeechChecked(recordId, field) {
    var r = rec(recordId);
    if (!r) return { ok: false, msg: '记录不存在' };
    R.markChecked(r, 'SP:' + field);
    auditEvent('字段核对', '校验记录', recordId, '', field + ' 标记为已核对', '低置信口述问答人工核对确认（FR-1204）');
    return { ok: true };
  }

  function updateField(recordId, field, value, reason) {
    var r = rec(recordId);
    if (!r) return { ok: false, msg: '记录不存在' };
    var labels = { cleanliness: '清洁', level: '水平调节', internalCal: '内部校正是否通过', box: '砝码盒编号', remark: '备注' };
    if (r.status === '已复核确认' || r.status === '已作废') {
      return { ok: false, msg: '已复核确认的记录所有字段不可修改，仅管理员可作废（FR-808）。' };
    }
    if (r.status === '已提交' && field !== 'remark') {
      return { ok: false, msg: '已提交状态下仅"备注"字段可由检验人员修改（FR-807）。' };
    }
    var before = r[field];
    r[field] = value;
    if (field === 'cleanliness' || field === 'level' || field === 'internalCal') R.markChecked(r, 'SP:' + field);
    r.modifications.push({
      field: labels[field] || field, before: before === '' ? '（空）' : before,
      after: value === '' ? '（空）' : value, by: state.user.id, at: now(),
      reason: reason || '（未填写）', stage: r.status
    });
    auditEvent('字段修改', '校验记录', recordId, String(before), String(value), reason || '未填写理由');
    return { ok: true };
  }

  /* ---------------- 状态流转（FR-804） ---------------- */
  function submitRecord(id) {
    var r = rec(id);
    if (!r) return { ok: false, msg: '记录不存在' };
    if (r.status !== '待提交') return { ok: false, msg: '仅"待提交"的记录可提交（FR-804）。' };
    if (!mine(r.inspector)) return { ok: false, msg: '仅记录归属检验人员可提交（4.1 权限矩阵）。' };
    var d = dev(r.device);
    var blockers = R.submitBlockers(r, d);
    if (blockers.length) return { ok: false, msg: '提交前校验未通过', blockers: blockers };
    r.status = '已提交';
    r.submittedBy = state.user.id;
    r.submittedAt = now();
    r.submittedFrom = 'PC-Chrome / 10.20.3.51';
    auditEvent('记录提交', '校验记录', id, '待提交', '已提交', '一键提交（电子确认），来源终端 ' + r.submittedFrom);
    return { ok: true };
  }

  function verifyRecord(id) {
    var r = rec(id);
    if (!r) return { ok: false, msg: '记录不存在' };
    if (r.status !== '已提交') return { ok: false, msg: '仅"已提交"的记录可复核确认（FR-804）。' };
    if (r.submittedBy === state.user.id) {
      return { ok: false, msg: '同一账号不得同时承担同一条记录的提交与复核确认（FR-110）。' };
    }
    r.status = '已复核确认';
    r.verifiedBy = state.user.id;
    r.verifiedAt = now();
    r.verifiedFrom = 'PC-Edge / 10.20.3.44';
    auditEvent('复核确认', '校验记录', id, '已提交', '已复核确认', '电子签名确认，来源终端 ' + r.verifiedFrom);
    return { ok: true };
  }

  function rejectRecord(id, reason) {
    var r = rec(id);
    if (!r) return { ok: false, msg: '记录不存在' };
    if (r.status !== '已提交') return { ok: false, msg: '仅"已提交"的记录可退回（FR-904）。' };
    r.status = '待提交';
    r.rejectedBy = state.user.id;
    r.rejectedAt = now();
    r.rejectReason = reason || '（未填写）';
    auditEvent('记录退回', '校验记录', id, '已提交', '待提交', reason || '未填写理由');
    return { ok: true };
  }

  function voidRecord(id, reason) {
    var r = rec(id);
    if (!r) return { ok: false, msg: '记录不存在' };
    if (r.status === '已作废') return { ok: false, msg: '该记录已作废。' };
    r.status = '已作废';
    r.voidBy = state.user.id;
    r.voidAt = now();
    r.voidReason = reason;
    auditEvent('记录作废', '校验记录', id, '已提交', '已作废', reason);
    return { ok: true };
  }

  /* ---------------- 主数据 ---------------- */
  function saveDevice(d) {
    var i = state.devices.map(function (x) { return x.id; }).indexOf(d.id);
    if (i >= 0) {
      var before = JSON.stringify(state.devices[i]);
      state.devices[i] = Object.assign(state.devices[i], d);
      auditEvent('天平档案变更', '天平档案', d.id, before, JSON.stringify(state.devices[i]), '维护天平档案（FR-211）');
    } else {
      state.devices.push(d);
      auditEvent('天平档案变更', '天平档案', d.id, '', '新增', '新建天平档案');
    }
    return { ok: true };
  }

  function saveBox(b) {
    var i = state.weightBoxes.map(function (x) { return x.id; }).indexOf(b.id);
    if (i >= 0) state.weightBoxes[i] = Object.assign(state.weightBoxes[i], b);
    else state.weightBoxes.push(b);
    auditEvent('砝码盒字典变更', '砝码盒字典', b.id, '', JSON.stringify(b), '维护砝码盒字典（FR-207）');
    return { ok: true };
  }

  /* ---------------- 账号管理（FR-102、FR-109） ---------------- */
  function saveAccount(a) {
    var i = state.accounts.map(function (x) { return x.id; }).indexOf(a.id);
    if (i >= 0) state.accounts[i] = Object.assign(state.accounts[i], a);
    else state.accounts.push(Object.assign({ status: '启用', firstLogin: true, pwd: '123456' }, a));
    auditEvent(i >= 0 ? '账号修改' : '账号新增', '账号', a.id, '', JSON.stringify(a), '维护账号与角色（FR-102）');
    return { ok: true };
  }

  function toggleAccount(id) {
    var a = acc(id);
    if (!a) return { ok: false, msg: '账号不存在' };
    if (a.id === state.user.id) return { ok: false, msg: '不能停用当前登录的管理员账号。' };
    var before = a.status;
    a.status = a.status === '启用' ? '停用' : '启用';
    auditEvent(a.status === '停用' ? '账号停用' : '账号启用', '账号', id, before, a.status,
      a.status === '停用' ? '停用后无法登录，历史记录保持可查（FR-109）' : '恢复启用');
    return { ok: true, status: a.status };
  }

  function resetPwd(id) {
    var a = acc(id);
    if (!a) return { ok: false, msg: '账号不存在' };
    a.pwd = '123456';
    a.firstLogin = true;
    auditEvent('口令重置', '账号', id, '', '重置为初始口令，首次登录强制改密', '管理员重置口令（FR-102）');
    return { ok: true };
  }

  function removeAccount(id) {
    if (id === state.user.id) return { ok: false, msg: '不能删除当前登录账号。' };
    var a = acc(id);
    if (!a) return { ok: false, msg: '账号不存在' };
    state.accounts = state.accounts.filter(function (x) { return x.id !== id; });
    auditEvent('账号删除', '账号', id, a.name, '已删除', '删除账号，历史记录保持不变');
    return { ok: true };
  }

  /* ---------------- 模板（FR-301~FR-306） ---------------- */
  function templateSave(patch, summary) {
    var n = parseInt(state.template.version.replace('v', ''), 10) + 1;
    state.template = Object.assign({}, state.template, patch);
    state.template.version = 'v' + n;
    state.templateVersions.unshift({
      v: 'v' + n, time: now(), by: state.user.id, summary: summary || '模板参数调整'
    });
    auditEvent('模板参数变更', '记录模板', 'v' + n, '', summary || '模板参数调整',
      '仅对调整后新产生的记录生效；历史记录按其生成时的模板版本渲染（FR-303 / FR-304）');
    return { ok: true, version: 'v' + n };
  }

  function templateReset() {
    state.template = clone(APP.template);
    state.templateVersions.unshift({
      v: state.template.version, time: now(), by: state.user.id, summary: '恢复默认模板（二次确认）'
    });
    auditEvent('模板参数变更', '记录模板', state.template.version, '', '恢复默认模板', '恢复默认模板并写入审计日志（FR-305）');
    return { ok: true };
  }

  /* ---------------- 存储与备份（FR-1305~FR-1310） ---------------- */
  function setQuota(v) {
    var before = state.storage.quota;
    state.storage.quota = v;
    state.storage.retainDays = Math.max(1, Math.round(v / 0.8));
    auditEvent('容量配置变更', '存储', '视频配额', before + 'GB', v + 'GB', '管理员调整视频存储配额');
    return { ok: true };
  }

  function demoUsed(pct) {
    var before = state.storage.used;
    state.storage.used = R.rnd(state.storage.quota * pct / 100, 1);
    state.storage.retainDays = Math.max(1, Math.round((state.storage.quota - state.storage.used) / 0.8));
    if (pct >= 90) {
      auditEvent('容量告警', '存储', '视频配额', before + 'GB', state.storage.used + 'GB',
        '使用率 ' + pct + '% 已达 90% 告警阈值' + (pct >= 100 ? '；已达配额上限，将按最早优先自动清理' : '（FR-1305）'));
    }
    return state.storage;
  }

  function backupRun() {
    var b = { time: now(), type: '手动', size: 268 + Math.round(Math.random() * 6), keep: '30 天', status: '成功', by: state.user.id };
    state.backups.unshift(b);
    auditEvent('备份执行', '系统', '手动备份', '', '成功', '备份对象：数据库（账号/主数据/记录/读数/审计）、系统配置、模板版本');
    return b;
  }

  function exportRun(cfg) {
    var item = {
      time: now(), by: state.user.id, type: cfg.type, scope: cfg.scope, count: cfg.count, files: cfg.files
    };
    state.exports.unshift(item);
    auditEvent('导出', '校验记录', cfg.scope, '', cfg.files.join('、'),
      '导出类型 ' + cfg.type + '；记录条数 ' + cfg.count + '；水印规则：' + (cfg.watermark || '无'));
    return item;
  }

  /* ---------------- 统计 ---------------- */
  function recordRows(filter) {
    var f = filter || {};
    return state.records.filter(function (r) {
      var d = dev(r.device);
      if (f.device && r.device !== f.device) return false;
      if (f.from && r.date < f.from) return false;
      if (f.to && r.date > f.to) return false;
      if (f.inspector && r.inspector !== f.inspector) return false;
      if (f.status && r.status !== f.status) return false;
      if (f.conclusion) {
        var ev = R.evaluate(r, d);
        if (ev.conclusion !== f.conclusion) return false;
      }
      return true;
    }).sort(function (a, b) { return a.id < b.id ? 1 : -1; });
  }

  function pendingVerify() {
    return state.records.filter(function (r) { return r.status === '已提交'; })
      .sort(function (a, b) { return (a.submittedAt || '') < (b.submittedAt || '') ? 1 : -1; });
  }

  function myDrafts() {
    return state.records.filter(function (r) {
      return (r.status === '待提交' || r.rejectedAt) && r.inspector === (state.user && state.user.id);
    });
  }

  function visibleTasks() {
    if (!state.user) return [];
    if (state.user.role === 'inspector') {
      return state.tasks.filter(function (t) { return t.user === state.user.id; })
        .sort(function (a, b) { return a.queuedAt < b.queuedAt ? 1 : -1; });
    }
    return state.tasks.slice().sort(function (a, b) { return a.queuedAt < b.queuedAt ? 1 : -1; });
  }

  var Store = {
    state: state, now: now, tick: tick,
    acc: acc, dev: dev, rec: rec, task: task, name: name, roleLabel: roleLabel, can: can, mine: mine,
    auditEvent: auditEvent,
    login: login, loginManual: loginManual, changePwd: changePwd, logout: logout, switchUser: switchUser,
    createUploadTask: createUploadTask, advanceQueue: advanceQueue, queueList: queueList, queuePos: queuePos,
    analyzingTask: analyzingTask, cancelTask: cancelTask, retryTask: retryTask,
    submitRecord: submitRecord, verifyRecord: verifyRecord, rejectRecord: rejectRecord, voidRecord: voidRecord,
    updateReadout: updateReadout, updateField: updateField,
    markReadoutChecked: markReadoutChecked, markSpeechChecked: markSpeechChecked,
    saveDevice: saveDevice, saveBox: saveBox,
    saveAccount: saveAccount, toggleAccount: toggleAccount, resetPwd: resetPwd, removeAccount: removeAccount,
    templateSave: templateSave, templateReset: templateReset,
    setQuota: setQuota, demoUsed: demoUsed, backupRun: backupRun, exportRun: exportRun,
    recordRows: recordRows, pendingVerify: pendingVerify, myDrafts: myDrafts, visibleTasks: visibleTasks
  };

  window.Store = Store;
})();
