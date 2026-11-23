/* ==========================================================================
   router.js — hash 路由、权限守卫、事件代理与全部交互动作
   ========================================================================== */
(function () {
  'use strict';

  var APP = window.APP, Store = window.Store, UI = window.UI, Views = window.Views, R = APP.Rules;

  var ROUTES = [
    { p: '/login', v: 'login', pub: true },
    { p: '/overview', v: 'overview' },
    { p: '/workbench', v: 'workbench', roles: ['inspector'] },
    { p: '/upload', v: 'upload', roles: ['inspector'] },
    { p: '/tasks', v: 'tasks' },
    { p: '/records', v: 'records' },
    { p: '/records/:id', v: 'recordDetail' },
    { p: '/review/:id', v: 'review', roles: ['inspector'] },
    { p: '/history/:device', v: 'history' },
    { p: '/verify', v: 'verify', roles: ['verifier'] },
    { p: '/verify/:id', v: 'verifyDetail', roles: ['verifier'] },
    { p: '/masterdata', v: 'masterdata', roles: ['verifier', 'admin'] },
    { p: '/template', v: 'template', roles: ['verifier', 'admin'] },
    { p: '/export', v: 'exportPage' },
    { p: '/accounts', v: 'accounts', roles: ['admin'] },
    { p: '/audit', v: 'audit', roles: ['admin'] },
    { p: '/system', v: 'system', roles: ['admin'] },
    { p: '/print/week', v: 'printWeek' },
    { p: '/print/blank', v: 'printBlank' },
    { p: '/print/:id', v: 'printRecord' }
  ];

  var ROUTE_TITLES = {
    '/overview': '演示导览', '/workbench': '工作台', '/upload': '视频上传', '/tasks': '分析任务',
    '/records': '记录查询', '/verify': '待复核', '/masterdata': '主数据', '/template': '模板配置',
    '/export': '导出与打印', '/accounts': '账号管理', '/audit': '审计日志', '/system': '系统状态'
  };

  function defaultRoute() {
    var role = Store.state.user && Store.state.user.role;
    if (role === 'inspector') return '/workbench';
    if (role === 'verifier') return '/verify';
    return '/system';
  }

  function match(path) {
    var segs = path.split('/').filter(Boolean);
    for (var i = 0; i < ROUTES.length; i++) {
      var r = ROUTES[i], rs = r.p.split('/').filter(Boolean);
      if (rs.length !== segs.length) continue;
      var params = [], ok = true;
      for (var j = 0; j < rs.length; j++) {
        if (rs[j].charAt(0) === ':') params.push(decodeURIComponent(segs[j]));
        else if (rs[j] !== segs[j]) { ok = false; break; }
      }
      if (ok) return { route: r, params: params };
    }
    return null;
  }

  function go(path) {
    if (location.hash.slice(1) === path) render();
    else location.hash = '#' + path;
  }

  function mount() {
    var content = document.querySelector('.content');
    if (content) content.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  var deniedLogged = {};
  function denied(res) {
    var user = Store.state.user;
    var allowed = Store.state.accounts.filter(function (a) {
      return a.status === '启用' && res.route.roles.indexOf(a.role) >= 0;
    });
    var key = res.route.p + '|' + user.id;
    if (!deniedLogged[key]) {
      deniedLogged[key] = true;
      Store.auditEvent('越权访问拦截', '页面', res.route.p, '', '已拒绝',
        '角色 ' + Store.roleLabel(user.role) + ' 无权访问该页面（FR-105、4.1 权限矩阵）');
    }
    var body = UI.alert('danger', '无权限访问该页面',
      '当前账号 <b>' + UI.esc(user.name) + '（' + user.id + '）· ' + Store.roleLabel(user.role) +
      '</b> 无权访问 <span class="num">' + res.route.p + '</span>。系统按最小权限原则控制访问，' +
      '该次越权访问已写入审计日志（FR-105、FR-1008、AC-021）。') +
      '<div class="grid grid-2">' +
      UI.card({
        title: '可访问该页面的角色',
        body: '<div class="flex wrap">' + res.route.roles.map(function (r) { return UI.tag(Store.roleLabel(r), APP.ROLES[r].color); }).join('') +
          '</div>' + (allowed.length
            ? '<div class="mt12 small muted">演示：切换到以下账号即可查看该页面</div><div class="flex wrap mt8">' +
              allowed.map(function (a) {
                return '<button class="btn btn-sm" data-act="switch-user-btn" data-arg="' + a.id + '">切换为 ' +
                  UI.esc(a.name) + '（' + Store.roleLabel(a.role) + '）</button>';
              }).join('') + '</div>'
            : '') +
          '<div class="mt12"><a class="btn btn-sm" href="#' + defaultRoute() + '">返回我的首页</a></div>'
      }) +
      UI.card({
        title: '当前角色的可访问页面',
        flush: true,
        body: UI.table({
          compact: true,
          cols: [
            { t: '页面', w: '220px', render: function (x) { return '<a href="#' + x.p + '">' + UI.esc(x.t) + '</a>'; } },
            { t: '说明', render: function (x) { return UI.esc(x.d); } }
          ],
          rows: Object.keys(ROUTE_TITLES).filter(function (p) {
            var m = match(p);
            return m && (!m.route.roles || m.route.roles.indexOf(user.role) >= 0);
          }).map(function (p) {
            var m = match(p);
            return { p: p, t: ROUTE_TITLES[p], d: m.route.roles ? m.route.roles.map(function (r) { return Store.roleLabel(r); }).join('、') : '全部已登录角色' };
          })
        })
      });
    return {
      html: UI.shell(UI.page({ pageKey: 'overview', title: '无权限访问', sub: '越权拦截演示', body: body }), Store.state.route),
      pageKey: 'overview'
    };
  }

  function render() {
    var path = location.hash.slice(1) || '/login';
    Store.state.route = path;
    var res = match(path);
    var app = document.getElementById('app');
    if (!res) {
      app.innerHTML = UI.shell(UI.page({
        pageKey: 'overview', title: '页面不存在',
        body: UI.alert('warn', '未找到该页面', '路径 <span class="num">' + UI.esc(path) + '</span> 不存在。' +
          '<a class="btn-link" href="#' + (Store.state.user ? defaultRoute() : '/login') + '">返回首页</a>')
      }), path);
      return;
    }
    if (res.route.pub) {
      if (Store.state.user) { go(defaultRoute()); return; }
    } else if (!Store.state.user) {
      Store.state.pendingRoute = path;
      go('/login');
      return;
    }
    var out;
    if (res.route.roles && res.route.roles.indexOf(Store.state.user.role) < 0) {
      out = denied(res);
    } else {
      try {
        out = Views[res.route.v].apply(null, res.params);
      } catch (err) {
        out = {
          html: UI.shell(UI.page({
            pageKey: 'overview', title: '页面渲染出错',
            body: UI.alert('danger', '原型内部错误', UI.esc(String(err && err.message || err)) +
              '<div class="small muted mt8">该错误为原型实现问题，不影响需求确认结论。</div>')
          }), path)
        };
        if (window.console) console.error(err);
      }
    }
    app.className = out && out.raw ? 'app app-plain' : 'app';
    app.innerHTML = out.html;
    mount();
  }

  /* ================= 弹窗工具 ================= */
  var modalCb = { ok: null, cancel: null };
  function confirmModal(o) {
    modalCb.ok = o.onOk || null;
    modalCb.cancel = o.onCancel || null;
    UI.openModal({
      title: o.title, sub: o.sub, size: o.size, body: o.body,
      buttons: [
        { label: o.cancelLabel || '取消', act: 'cancel' },
        { label: o.okLabel || '确定', act: 'ok', cls: o.tone || 'btn-pri' }
      ]
    });
  }
  function formModal(o) {
    modalCb.ok = o.onOk || null;
    modalCb.cancel = null;
    UI.openModal({ title: o.title, sub: o.sub, size: o.size, body: o.body, buttons: o.buttons });
  }
  function closeAndRerender(msg, tone) {
    UI.closeModal();
    render();
    if (msg) UI.toast(msg, tone);
  }

  /* ================= 点击动作 ================= */
  var Act = {};

  Act.logout = function () {
    Store.logout('用户主动退出');
    Store.state.loginError = null;
    try {
      /* 清掉 URL 上的 ?as= 深链参数，避免退出后又被自动登录（file:// 下可能受限，失败可忽略） */
      if (window.history && history.replaceState) {
        history.replaceState(null, '', location.pathname + (location.hash || ''));
      }
    } catch (e) { /* ignore */ }
    go('/login');
    UI.toast('已退出登录，退出事件已写入审计日志（FR-106）');
  };

  Act.login = function (id) {
    var res = Store.login(id);
    if (!res.ok) {
      Store.state.loginError = res.msg;
      render();
      return;
    }
    Store.state.loginError = null;
    if (res.firstLogin) {
      Act['change-pwd']();
      return;
    }
    UI.toast('登录成功：' + Store.state.user.name + '（' + Store.roleLabel(Store.state.user.role) + '）', 'ok');
    go(Store.state.pendingRoute || defaultRoute());
    Store.state.pendingRoute = null;
  };

  Act['login-manual'] = function () {
    var a = document.querySelector('input[name="acc"]'), p = document.querySelector('input[name="pwd"]');
    var res = Store.loginManual((a && a.value || '').trim(), p ? p.value : '');
    if (!res.ok) { Store.state.loginError = res.msg; render(); return; }
    Store.state.loginError = null;
    if (res.firstLogin) { Act['change-pwd'](); return; }
    UI.toast('登录成功：' + Store.state.user.name, 'ok');
    go(defaultRoute());
  };

  Act['change-pwd'] = function () {
    var me = Store.state.user;
    formModal({
      title: '首次登录：请修改口令',
      sub: '账号 ' + me.id + ' · ' + me.name + '（' + Store.roleLabel(me.role) + '）',
      size: 'narrow',
      body: UI.alert('warn', '首次登录强制修改口令（FR-104）', '口令长度不少于 8 位，且必须同时包含字母与数字。') +
        UI.field({ label: '新口令', required: true, control: UI.input('npwd', '', { type: 'password', placeholder: '例如 abc12345' }) }) +
        UI.field({ label: '确认新口令', required: true, control: UI.input('npwd2', '', { type: 'password' }) }),
      buttons: [{ label: '提交', act: 'ok', cls: 'btn-pri' }],
      onOk: function () {
        var v1 = (document.querySelector('input[name="npwd"]') || {}).value || '';
        var v2 = (document.querySelector('input[name="npwd2"]') || {}).value || '';
        if (v1 !== v2) { UI.toast('两次输入的口令不一致', 'danger'); return; }
        var r = Store.changePwd(me.id, v1);
        if (!r.ok) { UI.toast(r.msg, 'danger'); return; }
        closeAndRerender('口令修改成功，已写入审计日志', 'ok');
        go(Store.state.pendingRoute || defaultRoute());
        Store.state.pendingRoute = null;
      }
    });
  };

  Act['switch-user-btn'] = function (id) {
    var r = Store.switchUser(id);
    if (!r.ok) { UI.toast(r.msg, 'danger'); return; }
    go(defaultRoute());
    UI.toast('已切换为 ' + Store.state.user.name + '（' + Store.roleLabel(Store.state.user.role) + '）', 'ok');
  };

  Act['page'] = function (n) { Store.state.filter.records.page = Number(n); render(); };
  Act['filter-reset'] = function () {
    Store.state.filter.records = { device: '', from: '', to: '', inspector: '', conclusion: '', status: '', page: 1, size: 8 };
    render();
  };
  Act['export-list'] = function () {
    Store.auditEvent('导出', '校验记录', '记录清单', '', '天平校验记录清单.csv', '按当前筛选条件导出记录清单（FR-812）');
    render();
    UI.toast('已生成导出文件：天平校验记录清单.csv（CSV 含当前筛选条件下的全部记录）', 'ok');
  };
  Act['export-detail'] = function () {
    Store.auditEvent('导出', '校验记录', '示值明细汇总表', '', '天平校验示值明细.xlsx', '导出示值明细汇总表（FR-1006）');
    render();
    UI.toast('已生成导出文件：天平校验示值明细.xlsx', 'ok');
  };
  Act['hist-reset'] = function () {
    Store.state.filter.records.histFrom = '';
    Store.state.filter.records.histTo = '';
    render();
  };
  Act['player-jump'] = function (key) {
    Store.state.player.recordId = (Store.state.route.split('/')[2] || '');
    Store.state.player.key = key;
    render();
  };
  Act['ac-clear'] = function () { Store.state.checked = {}; render(); };
  Act['nav-first'] = function () { go('/upload'); };
  Act['toast-print'] = function () { UI.toast('原型演示：真实系统将导出《需求覆盖对照清单》供客户逐条签认'); };
  Act['toast-save'] = function () { UI.toast('已保存核对进度（原型内存状态，刷新后复位）', 'ok'); };
  Act['toast-export'] = function () { UI.toast('已生成导出文件（原型模拟，不产生真实文件）', 'ok'); };
  Act['print'] = function () { window.print(); };

  /* ---- 记录详情：作废 ---- */
  Act['void-record'] = function (id) {
    var r = Store.rec(id);
    confirmModal({
      title: '作废记录 ' + id,
      sub: '作废后记录只读、标注"已作废"、不参与统计与批量导出（FR-809）',
      size: 'narrow', tone: 'btn-danger', okLabel: '确认作废',
      body: UI.alert('warn', '请填写作废理由', '理由将写入记录与审计日志，供追溯。') +
        UI.field({ label: '作废理由', required: true, control: UI.textarea('vreason', '', { placeholder: '例如：砝码盒编号填写错误，需重新拍摄校验' }) }),
      onOk: function () {
        var reason = ((document.querySelector('[name="vreason"]') || {}).value || '').trim();
        if (!reason) { UI.toast('请填写作废理由', 'danger'); return; }
        var res = Store.voidRecord(id, reason);
        if (!res.ok) { UI.toast(res.msg, 'danger'); return; }
        closeAndRerender('记录已作废，作废动作已写入审计日志', 'warn');
      }
    });
  };

  /* ---- 上传 ---- */
  Act['pick-file'] = function () {
    var el = document.getElementById('file-input');
    if (el) el.click();
  };
  Act['upload-sample'] = function (i) {
    var s = APP._samples[i];
    Store.state.upload = Object.assign({}, Store.state.upload, {
      name: s.name, size: s.size, device: s.device,
      startTime: '2026-09-28T10:05', confirmed: false, scenario: 'pass'
    });
    render();
    UI.toast('已选择示例文件（原型模拟，不会真实上传）');
  };
  Act['upload-start'] = function () {
    var up = Store.state.upload;
    if (!up || !up.name) return;
    up.uploading = true;
    render();
    var p = 0;
    var iv = setInterval(function () {
      p += 8 + Math.random() * 16;
      var bar = document.getElementById('upload-bar'), pc = document.getElementById('upload-pct');
      if (bar) bar.style.width = Math.min(100, p) + '%';
      if (pc) pc.textContent = Math.min(100, Math.round(p)) + '%';
      if (p >= 100) {
        clearInterval(iv);
        up.uploading = false;
        var t = Store.createUploadTask({
          file: up.name, size: up.size, device: up.device, startTime: up.startTime,
          scenario: up.scenario || 'pass', source: 'PC-Chrome / 10.20.3.51'
        });
        Store.state.upload = { name: '', size: 0, device: '', startTime: '', confirmed: false, scenario: 'pass' };
        UI.toast('上传完成，已创建分析任务 ' + t.id + '（排队中）；文件校验值已写入记录（FR-408）', 'ok');
        go('/tasks');
      }
    }, 240);
  };

  /* ---- 任务队列 ---- */
  Act['task-advance'] = function () {
    var res = Store.advanceQueue();
    render();
    if (res.step === '队列为空') { UI.toast('当前队列为空，可在「视频上传」页创建新的分析任务', 'warn'); return; }
    if (res.step === '开始分析') { UI.toast('已开始分析 ' + res.task.id + '（' + res.task.file + '）', 'ok'); return; }
    if (res.record) {
      var ev = R.evaluate(res.record, Store.dev(res.record.device));
      UI.toast('分析完成，生成记录 ' + res.record.id + '，判定"' + ev.conclusion + '"', ev.pass ? 'ok' : 'warn');
    } else {
      UI.toast('分析完成：' + (res.task ? res.task.status : ''), 'warn');
    }
  };
  Act['task-cancel'] = function (id) {
    var res = Store.cancelTask(id);
    if (!res.ok) { UI.toast(res.msg, 'danger'); return; }
    render();
    UI.toast('已取消排队任务 ' + id + '，取消动作已写入审计日志（FR-409）', 'warn');
  };
  Act['task-retry'] = function (id) {
    var res = Store.retryTask(id);
    if (!res.ok) { UI.toast(res.msg, 'danger'); return; }
    render();
    UI.toast('任务 ' + id + ' 已重新排队，重试不会产生重复记录（FR-504）', 'ok');
  };

  /* ---- 核对与提交 ---- */
  Act['edit-readout'] = function (key) {
    var id = Store.state.route.split('/')[2];
    var r = Store.rec(id);
    var d = Store.dev(r.device);
    var it = R.evaluate(r, d).items.filter(function (x) { return x.key === key; })[0];
    formModal({
      title: '修正测量示值 ' + key,
      sub: '天平 ' + d.id + ' · 标称值 ' + it.L + 'g · 限度 ' + R.fmt(it.lim.lo, it.dec) + 'g~' + R.fmt(it.lim.hi, it.dec) + 'g',
      size: 'narrow',
      body: UI.alert('info', '修正必须可追溯（FR-806）',
        '系统将记录修改前后值、时间、操作人与理由，并按修正后的读数重新判定（FR-708）。') +
        UI.field({
          label: '原识别值', control: UI.input('old', it.missing ? '（缺次，未识别到有效读数）' : R.fmt(it.value, it.dec) + ' g', { disabled: true })
        }) +
        UI.field({
          label: '修正后示值 (g)', required: true,
          control: UI.input('newval', it.missing ? '' : R.fmt(it.value, it.dec), { cls: 'num', placeholder: '按识别截图填写，保留 ' + it.dec + ' 位小数' }),
          hint: '按天平精度 d 对齐小数位：本量程应为 ' + it.dec + ' 位小数'
        }) +
        UI.field({ label: '修正理由', control: UI.textarea('rreason', '', { placeholder: '例如：识别截图核对，识别值末位误读' }) }),
      buttons: [{ label: '取消', act: 'cancel' }, { label: '保存修正', act: 'ok', cls: 'btn-pri' }],
      onOk: function () {
        var v = ((document.querySelector('[name="newval"]') || {}).value || '').trim();
        var reason = ((document.querySelector('[name="rreason"]') || {}).value || '').trim();
        if (v === '') { UI.toast('请填写修正后的示值', 'danger'); return; }
        var res = Store.updateReadout(id, key, v, reason);
        if (!res.ok) { UI.toast(res.msg, 'danger'); return; }
        closeAndRerender(key + ' 已修正：' + res.before + ' → ' + res.after + '，判定已重新计算', 'ok');
      }
    });
  };
  Act['mark-readout'] = function (key) {
    var id = Store.state.route.split('/')[2];
    var res = Store.markReadoutChecked(id, key);
    if (!res.ok) { UI.toast(res.msg, 'danger'); return; }
    render();
    UI.toast(key + ' 已标记为人工核对确认（FR-612）', 'ok');
  };
  Act['mark-speech'] = function (field) {
    var id = Store.state.route.split('/')[2];
    var res = Store.markSpeechChecked(id, field);
    if (!res.ok) { UI.toast(res.msg, 'danger'); return; }
    render();
    UI.toast('已确认口述问答取值并留痕', 'ok');
  };
  Act['save-remark'] = function () {
    var id = Store.state.route.split('/')[2];
    var el = document.querySelector('[name="remark"]');
    var res = Store.updateField(id, 'remark', (el ? el.value : '').trim() || '无', '保存备注');
    if (!res.ok) { UI.toast(res.msg, 'danger'); return; }
    render();
    UI.toast('备注已保存并留痕' + (Store.rec(id).status === '已提交' ? '（提交后仅备注可改，FR-807）' : ''), 'ok');
  };
  Act['review-submit'] = function () {
    var id = Store.state.route.split('/')[2];
    var r = Store.rec(id);
    confirmModal({
      title: '一键提交记录 ' + id,
      sub: '提交即视为检验人员的电子确认（FR-805）',
      size: 'narrow',
      body: UI.alert('info', '提交后将发生什么',
        '① 记录状态由"待提交"变为"已提交"；② 记录提交人账号、姓名、时间与来源终端；' +
        '③ 记录进入复核确认人员的待复核列表；④ 提交后仅"备注"字段可修改（FR-807）。') +
        '<div class="kv-2">' +
        UI.kv([['记录编号', '<span class="num">' + id + '</span>'], ['检验人员', UI.esc(Store.name(r.inspector))]]) +
        UI.kv([['判定结论', UI.tag(R.evaluate(r, Store.dev(r.device)).conclusion, R.evaluate(r, Store.dev(r.device)).pass ? 'ok' : 'danger')],
          ['来源终端', 'PC-Chrome / 10.20.3.51']]) +
        '</div>',
      okLabel: '确认提交',
      onOk: function () {
        var res = Store.submitRecord(id);
        if (!res.ok) {
          UI.toast(res.msg, 'danger');
          return;
        }
        closeAndRerender('提交成功，记录已进入待复核列表（复核确认人员菜单角标已更新）', 'ok');
      }
    });
  };

  /* ---- 复核 ---- */
  Act['verify-confirm'] = function (id) {
    var r = Store.rec(id);
    confirmModal({
      title: '电子签名确认',
      sub: '确认后记录锁定，所有字段不可修改（FR-903、FR-808）',
      size: 'narrow',
      body: UI.alert('info', '复核确认即电子签名',
        '系统将记录复核人账号、姓名、时间与来源终端。确认后如需更正，只能由管理员作废记录并重新拍摄校验。') +
        '<div class="kv-2">' +
        UI.kv([['记录编号', '<span class="num">' + id + '</span>'], ['检验人员', UI.esc(Store.name(r.inspector))]]) +
        UI.kv([['复核确认人', UI.esc(Store.state.user.name) + '（' + Store.state.user.id + '）'], ['来源终端', 'PC-Edge / 10.20.3.44']]) +
        '</div>',
      okLabel: '确认并签名',
      onOk: function () {
        var res = Store.verifyRecord(id);
        if (!res.ok) { UI.toast(res.msg, 'danger'); return; }
        closeAndRerender('复核确认完成，记录已锁定并写入审计日志', 'ok');
        go('/verify');
      }
    });
  };
  Act['verify-reject'] = function (id) {
    confirmModal({
      title: '退回记录 ' + id,
      sub: '退回后记录回到"待提交"状态并通知检验人员（FR-904）',
      size: 'narrow', tone: 'btn-danger', okLabel: '确认退回',
      body: UI.alert('warn', '退回理由可选填', '系统不强制使用退回功能：客户也可按现行方式口头通知检验人员修改（FR-905）。') +
        UI.field({
          label: '退回理由', control: UI.textarea('rjreason', '', {
            placeholder: '例如：第 2 只砝码第 1 次称重读数与截图不一致，请核对后重新提交'
          })
        }),
      onOk: function () {
        var reason = ((document.querySelector('[name="rjreason"]') || {}).value || '').trim();
        var res = Store.rejectRecord(id, reason);
        if (!res.ok) { UI.toast(res.msg, 'danger'); return; }
        closeAndRerender('记录已退回检验人员修改，退回动作已写入审计日志', 'warn');
      }
    });
  };

  /* ---- 主数据 ---- */
  Act['master-tab'] = function (tab) { Store.state.masterTab = tab; render(); };
  Act['device-new'] = function () { Act['device-edit'](null, true); };
  Act['device-edit'] = function (id, isNew) {
    var d = isNew ? null : Store.dev(id);
    formModal({
      title: isNew ? '新建天平档案' : '编辑天平档案 ' + id,
      sub: '砝码标称点由系统按量程与精度自动推荐，允许复核确认人员修改（FR-203）',
      size: 'wide',
      body: Views.deviceForm(d),
      buttons: [{ label: '取消', act: 'cancel' }, { label: '保存', act: 'ok', cls: 'btn-pri' }],
      onOk: function () {
        var g = function (i) { var el = document.getElementById(i); return el ? el.value.trim() : ''; };
        var ranges = Number(g('df-ranges')) === 2 ? 2 : 1;
        var nd = {
          id: g('df-id'), uniqueNo: g('df-unique'), dept: g('df-dept'),
          ranges: ranges, range1: { max: Number(g('df-r1max')) || 220, d: Number(g('df-r1d')) || 0.1 },
          range2: ranges === 2 ? { max: Number(g('df-r2max')) || 40, d: Number(g('df-r2d')) || 0.01 } : null,
          max: Number(g('df-r1max')) || 220, d: Number(g('df-r1d')) || 0.1,
          internalCal: g('df-cal'),
          points: [Number(g('df-p0')), Number(g('df-p1')), Number(g('df-p2'))],
          pointRange: ranges === 2 ? [1, 2, 2] : [1, 1, 1],
          pointAuto: false, tol: Number(g('df-tol')) || 0.05,
          defaultBox: g('df-box'), qrContent: g('df-qr'),
          qrValue: g('df-qr') === '天平编号' ? g('df-id') : g('df-unique'),
          status: '在用', remark: g('df-remark')
        };
        if (!nd.id || !nd.uniqueNo) { UI.toast('天平编号与天平唯一号为必填项（FR-201）', 'danger'); return; }
        if (nd.points.some(function (p) { return !p; })) { UI.toast('三个砝码标称点均为必填项', 'danger'); return; }
        Store.saveDevice(nd);
        closeAndRerender('天平档案已保存：' + nd.id + '（砝码标称点 ' + nd.points.join(' / ') + 'g）', 'ok');
      }
    });
  };
  Act['dev-recommend'] = function () {
    var g = function (i) { var el = document.getElementById(i); return el ? el.value.trim() : ''; };
    var ranges = Number(g('df-ranges')) === 2 ? 2 : 1;
    var dev = {
      ranges: ranges,
      range1: { max: Number(g('df-r1max')) || 220, d: Number(g('df-r1d')) || 0.1 },
      range2: ranges === 2 ? { max: Number(g('df-r2max')) || 40, d: Number(g('df-r2d')) || 0.01 } : null
    };
    var pts = R.recommendPoints(dev);
    pts.forEach(function (p, i) { var el = document.getElementById('df-p' + i); if (el) el.value = p; });
    UI.toast('已按量程与精度推荐砝码标称点：' + pts.join(' / ') + ' g（FR-203）', 'ok');
  };
  Act['dev-form-ranges'] = function (arg, el) {
    var isTwo = el.value === '2';
    var r2 = document.getElementById('df-r2max'), r2d = document.getElementById('df-r2d');
    if (r2 && !r2.value) r2.value = 40;
    if (r2d && !r2d.value) r2d.value = 0.01;
    UI.toast(isTwo ? '已切换为双量程，请填写第二量程' : '已切换为单量程，第二量程留空');
  };
  Act['device-limits'] = function (id) {
    var d = Store.dev(id);
    var body = '<div class="rule-note">限度 = (1 ± ' + d.tol + '%) × L，并按该量程精度 d 对齐小数位（FR-204）</div>' +
      UI.table({
        compact: true,
        cols: [
          { t: '标称点', w: '100px', render: function (x) { return '<b>' + x.k + '</b>'; } },
          { t: '量程', w: '110px', render: function (x) { return x.r; } },
          { t: '标称值 L', w: '100px', align: 'right', render: function (x) { return '<span class="num">' + x.L + 'g</span>'; } },
          { t: '精度 d', w: '100px', align: 'right', render: function (x) { return '<span class="num">' + x.d + 'mg</span>'; } },
          { t: '限度区间', align: 'right', render: function (x) { return '<span class="num">' + x.lim + '</span>'; } }
        ],
        rows: [0, 1, 2].map(function (p) {
          var range = d.ranges === 2 ? (d.pointRange[p] || (p === 0 ? 1 : 2)) : 1;
          var dd = range === 2 && d.range2 ? d.range2.d : d.range1.d;
          var dec = R.decimalsOf(d, range);
          return { k: 'L' + (p + 1), r: R.rangeLabel(d, range), L: d.points[p], d: dd, lim: R.limitText(d.points[p], dec, d.tol) };
        })
      });
    confirmModal({
      title: '限度计算 ' + d.id, sub: d.uniqueNo + ' · 容差系数 ' + d.tol + '%', size: 'wide',
      okLabel: '知道了', cancelLabel: '关闭', body: body
    });
  };
  Act['device-status'] = function (id) {
    var d = Store.dev(id);
    var to = d.status === '在用' ? '停用' : '在用';
    confirmModal({
      title: (to === '停用' ? '停用' : '启用') + '天平 ' + id,
      size: 'narrow', tone: to === '停用' ? 'btn-danger' : 'btn-pri',
      body: to === '停用'
        ? UI.alert('warn', '停用后不再生成新记录', '停用的天平不得再生成新记录，其历史记录保持可查（FR-206）。')
        : UI.alert('info', '恢复启用', '恢复后该天平可继续生成新的校验记录。'),
      onOk: function () {
        d.status = to;
        Store.auditEvent('天平档案变更', '天平档案', id, to === '停用' ? '在用' : '停用', to,
          to === '停用' ? '停用后不生成新记录，历史记录保持可查（FR-206）' : '恢复启用');
        closeAndRerender('天平 ' + id + ' 已' + to, 'ok');
      }
    });
  };
  Act['export-devices'] = function () {
    Store.auditEvent('导出', '天平档案', '天平清单', '', '天平清单.csv', '导出天平档案列表（FR-212）');
    render();
    UI.toast('已导出天平清单.csv（可选需求 FR-212）', 'ok');
  };
  Act['box-new'] = function () { Act['box-edit'](null, true); };
  Act['box-edit'] = function (id, isNew) {
    var b = isNew ? { id: '', status: '启用', remark: '' } : Store.state.weightBoxes.filter(function (x) { return x.id === id; })[0];
    formModal({
      title: isNew ? '新增砝码盒' : '编辑砝码盒 ' + id,
      sub: '砝码盒编号为字母 + 数字、≤10 位且唯一；砝码盒与天平不建立绑定关系（FR-207）',
      size: 'narrow',
      body: UI.field({ label: '砝码盒编号', required: true, control: UI.input('bid', b.id, { attrs: ' id="box-id"', disabled: !isNew }) }) +
        UI.field({ label: '状态', control: UI.select('bstatus', b.status, ['启用', '停用'], { attrs: ' id="box-status"' }) }) +
        UI.field({ label: '备注', control: UI.textarea('bremark', b.remark, { attrs: ' id="box-remark"' }) }),
      buttons: [{ label: '取消', act: 'cancel' }, { label: '保存', act: 'ok', cls: 'btn-pri' }],
      onOk: function () {
        var g = function (i) { var el = document.getElementById(i); return el ? el.value.trim() : ''; };
        var id2 = isNew ? g('box-id') : id;
        if (!/^[A-Za-z0-9]{1,10}$/.test(id2)) { UI.toast('砝码盒编号须为字母 + 数字且不超过 10 位（FR-207）', 'danger'); return; }
        Store.saveBox({ id: id2, status: g('box-status'), remark: g('box-remark'), lastUse: '-', });
        closeAndRerender('砝码盒 ' + id2 + ' 已保存并写入审计日志', 'ok');
      }
    });
  };
  Act['box-status'] = function (id) {
    var b = Store.state.weightBoxes.filter(function (x) { return x.id === id; })[0];
    b.status = b.status === '启用' ? '停用' : '启用';
    Store.auditEvent('砝码盒字典变更', '砝码盒字典', id, b.status === '启用' ? '停用' : '启用', b.status, '维护砝码盒字典状态');
    render();
    UI.toast('砝码盒 ' + id + ' 已' + b.status, 'ok');
  };

  /* ---- 模板配置 ---- */
  Act['tpl-save'] = function () {
    var v = Store.templateSave({}, '通过模板配置页保存：容差系数、字段显隐与名称、页脚文字、是否打印测量时间');
    render();
    UI.toast('模板已保存并生成新版本 ' + v.version + '；历史记录按其生成时的版本渲染（FR-303、FR-304）', 'ok');
  };
  Act['tpl-reset'] = function () {
    confirmModal({
      title: '恢复默认模板', size: 'narrow', tone: 'btn-danger', okLabel: '确认恢复',
      body: UI.alert('warn', '恢复动作需二次确认并写入审计日志（FR-305）',
        '恢复后将回到与客户现行《电子天平日常校验记录表》一致的默认配置；已复核确认的记录内容与导出结果不受影响。'),
      onOk: function () { Store.templateReset(); closeAndRerender('已恢复默认模板，动作已写入审计日志', 'warn'); }
    });
  };

  /* ---- 导出 ---- */
  Act['export-generate'] = function () {
    var st = Store.state.filter.exp;
    var rows = Store.recordRows({ device: '', from: st.from, to: st.to })
      .filter(function (r) { return st.devices.indexOf(r.device) >= 0; })
      .filter(function (r) { return st.includeUnverified ? true : r.status === '已复核确认'; });
    var files = [];
    if (st.mode === 'merge') {
      files.push('天平校验记录_' + st.devices.join('-') + '_' + st.from + '-' + st.to + '.pdf');
    } else {
      var seen = {};
      rows.forEach(function (r) {
        var n = '天平校验记录_' + r.device + '_' + r.date.replace(/-/g, '') + '.pdf';
        if (!seen[n]) { seen[n] = 1; files.push(n); }
      });
      if (!files.length) files.push('（无符合条件记录）');
    }
    Store.state.exportResult = {
      count: rows.length, files: files,
      watermark: st.includeUnverified ? '待提交/已提交记录带"未复核"水印' : '无'
    };
    Store.exportRun({
      type: '批量 PDF', scope: st.devices.join('、') + ' / ' + st.from + ' ~ ' + st.to,
      count: rows.length, files: files, watermark: Store.state.exportResult.watermark
    });
    render();
    UI.toast('导出完成：' + rows.length + ' 条记录，' + files.length + ' 个文件（原型模拟）', 'ok');
  };
  Act['export-one'] = function () {
    var id = Store.state.filter.exp.one;
    var r = Store.rec(id);
    if (!r) { UI.toast('请先选择记录', 'danger'); return; }
    var fn = '天平校验记录_' + r.device + '_' + r.date.replace(/-/g, '') + '.pdf';
    Store.exportRun({
      type: '单条 PDF', scope: id, count: 1, files: [fn],
      watermark: r.status === '已复核确认' ? '无（已复核确认，可作正式记录）' : r.status === '已作废' ? '已作废水印' : '未复核水印'
    });
    render();
    UI.toast('已导出 ' + fn + (r.status === '已复核确认' ? '（正式版式）' : '（带' + (r.status === '已作废' ? '已作废' : '未复核') + '水印）'), 'ok');
  };

  /* ---- 账号管理 ---- */
  Act['account-new'] = function () { Act['account-edit'](null, true); };
  Act['account-edit'] = function (id, isNew) {
    var a = isNew ? { id: '', name: '', role: 'inspector', status: '启用' } : Store.acc(id);
    formModal({
      title: isNew ? '新增账号' : '编辑账号 ' + id,
      sub: '账号为系统内唯一编号，同时作为人员卡二维码内容（FR-103、FR-107）',
      size: 'narrow',
      body: UI.field({ label: '账号编号', required: true, control: UI.input('aid', a.id, { attrs: ' id="ac-id"', disabled: !isNew }), hint: '唯一编号，用于人员卡二维码（FR-107）' }) +
        UI.field({ label: '姓名', required: true, control: UI.input('aname', a.name, { attrs: ' id="ac-name"' }) }) +
        UI.field({ label: '角色', required: true, control: UI.select('arole', a.role, [{ v: 'inspector', t: '检验人员' }, { v: 'verifier', t: '复核确认人员' }, { v: 'admin', t: '管理员' }], { attrs: ' id="ac-role"' }), hint: '一个账号只能属于一种角色（FR-101）' }) +
        (isNew ? UI.alert('info', '初始口令', '新账号初始口令为 123456，首次登录强制修改（CR-017）。') : ''),
      buttons: [{ label: '取消', act: 'cancel' }, { label: '保存', act: 'ok', cls: 'btn-pri' }],
      onOk: function () {
        var g = function (i) { var el = document.getElementById(i); return el ? el.value.trim() : ''; };
        var na = { id: isNew ? g('ac-id') : id, name: g('ac-name'), role: g('ac-role') };
        if (!na.id || !na.name) { UI.toast('账号编号与姓名为必填项', 'danger'); return; }
        Store.saveAccount(na);
        closeAndRerender('账号 ' + na.id + ' 已保存，操作已写入审计日志', 'ok');
      }
    });
  };
  Act['account-toggle'] = function (id) {
    var res = Store.toggleAccount(id);
    if (!res.ok) { UI.toast(res.msg, 'danger'); return; }
    render();
    UI.toast('账号 ' + id + ' 已' + res.status +
      (res.status === '停用' ? '；该账号将无法登录，历史操作与记录保持不变（FR-109）' : ''), 'ok');
  };
  Act['account-reset'] = function (id) {
    confirmModal({
      title: '重置口令 ' + id, size: 'narrow', okLabel: '确认重置',
      body: UI.alert('warn', '重置后需重新设置口令', '口令将重置为初始值 123456，该账号下次登录时强制修改（FR-102、CR-017）。'),
      onOk: function () { Store.resetPwd(id); closeAndRerender('账号 ' + id + ' 口令已重置，动作已写入审计日志', 'ok'); }
    });
  };
  Act['account-delete'] = function (id) {
    confirmModal({
      title: '删除账号 ' + id, size: 'narrow', tone: 'btn-danger', okLabel: '确认删除',
      body: UI.alert('warn', '删除账号的历史影响',
        '删除仅移除账号本身；该账号历史操作与记录保持不变，审计日志中仍保留其姓名（FR-109）。' +
        '如需保留登录能力但禁止使用，建议改用"停用"。'),
      onOk: function () {
        var res = Store.removeAccount(id);
        if (!res.ok) { UI.toast(res.msg, 'danger'); return; }
        closeAndRerender('账号 ' + id + ' 已删除', 'warn');
      }
    });
  };
  Act['export-cards'] = function () {
    Store.auditEvent('导出', '卡片清单', '人员卡 / 设备卡', '', '人员卡与设备卡内容清单.csv', '导出手工填写用空白记录表与卡片内容清单（FR-108）');
    go('/print/blank');
    UI.toast('已生成卡片内容清单，可在打印预览页查看（FR-108）', 'ok');
  };

  /* ---- 审计 ---- */
  Act['audit-reset'] = function () { Store.state.filter.audit = { from: '', to: '', user: '', type: '' }; render(); };
  Act['export-audit'] = function () {
    Store.auditEvent('导出', '审计日志', '审计事件', '', '审计日志.csv',
      '导出审计日志，共 ' + Store.state.audit.length + ' 条（FR-1303）');
    render();
    UI.toast('已导出审计日志.csv（共 ' + Store.state.audit.length + ' 条），导出动作本身也已留痕', 'ok');
  };

  /* ---- 系统 ---- */
  Act['storage-save'] = function () {
    var el = document.querySelector('[name="quota"]');
    var v = Number(el && el.value);
    if (!v || v < 10) { UI.toast('配额需为不小于 10GB 的数值', 'danger'); return; }
    Store.setQuota(v);
    render();
    UI.toast('视频存储配额已调整为 ' + v + 'GB，变更已写入审计日志', 'ok');
  };
  Act['backup-run'] = function () {
    var b = Store.backupRun();
    render();
    UI.toast('手动备份已执行完成：' + b.time + ' · ' + b.size + 'MB · 保留 ' + b.keep + '（FR-1310）', 'ok');
  };
  Act['health-check'] = function () {
    Store.auditEvent('健康检查', '系统', '服务健康检查', '', '全部服务正常', '健康检查接口 /healthz 返回 200（FR-1313）');
    render();
    UI.toast('健康检查通过：Web / 应用服务 / 分析服务 / 数据库 / 文件存储均正常（FR-1313）', 'ok');
  };
  Act['log-export'] = function () {
    Store.auditEvent('导出', '运行日志', '系统运行日志', '', 'system.log.zip', '导出分级运行日志用于故障排查（FR-1311）');
    render();
    UI.toast('已导出 system.log.zip（运行日志分级、可轮转、保留 30 天）', 'ok');
  };

  /* ---- 弹窗按钮 ---- */
  Act['modal-btn'] = function (arg) {
    var fn = arg === 'ok' ? modalCb.ok : modalCb.cancel;
    if (typeof fn === 'function') fn();
    else UI.closeModal();
  };
  Act['modal-mask'] = function (arg, el, e) {
    if (e.target === el) UI.closeModal();
  };

  /* ================= 变更动作 ================= */
  var Chg = {};
  Chg['toggle-trace'] = function (a, el) { Store.state.showTrace = el.checked; render(); };
  Chg['switch-user'] = function (a, el) {
    var r = Store.switchUser(el.value);
    if (!r.ok) { UI.toast(r.msg, 'danger'); render(); return; }
    go(defaultRoute());
    UI.toast('已切换演示账号：' + Store.state.user.name + '（' + Store.roleLabel(Store.state.user.role) + '）', 'ok');
  };
  ['filter-device', 'filter-from', 'filter-to', 'filter-inspector', 'filter-conclusion', 'filter-status'].forEach(function (k) {
    Chg[k] = function (a, el) {
      var map = { 'filter-device': 'device', 'filter-from': 'from', 'filter-to': 'to', 'filter-inspector': 'inspector', 'filter-conclusion': 'conclusion', 'filter-status': 'status' };
      Store.state.filter.records[map[k]] = el.value;
      Store.state.filter.records.page = 1;
      render();
    };
  });
  Chg['hist-device'] = function (a, el) { Store.state.filter.records.device = ''; go('/history/' + el.value); };
  Chg['hist-from'] = function (a, el) { Store.state.filter.records.histFrom = el.value; render(); };
  Chg['hist-to'] = function (a, el) { Store.state.filter.records.histTo = el.value; render(); };
  Chg['ac-check'] = function (a, el) { Store.state.checked[a] = el.checked; render(); };
  Chg['upload-file'] = function (a, el) {
    var f = el.files && el.files[0];
    if (!f) return;
    Store.state.upload = Object.assign({}, Store.state.upload, {
      name: f.name, size: Math.round(f.size / 1048576 * 10) / 10,
      startTime: '2026-09-28T10:05', confirmed: false, scenario: 'pass'
    });
    render();
    UI.toast('已选择文件：' + f.name + '（' + Store.state.upload.size + 'MB，格式与大小校验已执行）');
  };
  Chg['upload-time'] = function (a, el) { Store.state.upload.startTime = el.value; render(); };
  Chg['upload-device'] = function (a, el) { Store.state.upload.device = el.value; render(); };
  Chg['upload-scenario'] = function (a, el) { Store.state.upload.scenario = el.value; render(); };
  Chg['upload-confirm'] = function (a, el) { Store.state.upload.confirmed = el.checked; render(); };
  Chg['speech-field'] = function (a, el) {
    var id = Store.state.route.split('/')[2];
    Store.updateField(id, a, el.value, '按语音识别候选值确认');
    render();
    UI.toast('字段已更新并留痕：' + a + ' = ' + el.value, 'ok');
  };
  Chg['field-box'] = function (a, el) {
    var id = Store.state.route.split('/')[2];
    var res = Store.updateField(id, 'box', el.value, '选择砝码盒编号');
    if (!res.ok) { UI.toast(res.msg, 'danger'); return; }
    render();
    UI.toast('砝码盒编号已更新为 ' + el.value + '（FR-208）', 'ok');
  };
  ['verify-device', 'verify-inspector', 'verify-from', 'verify-to'].forEach(function (k) {
    Chg[k] = function (a, el) {
      var map = { 'verify-device': 'device', 'verify-inspector': 'inspector', 'verify-from': 'from', 'verify-to': 'to' };
      Store.state.filter.verify[map[k]] = el.value;
      render();
    };
  });
  Chg['tpl-field-show'] = function (a, el) {
    var f = Store.state.template.fields.filter(function (x) { return x.key === a; })[0];
    if (f) f.show = el.checked;
    render();
  };
  Chg['tpl-field-label'] = function (a, el) {
    var f = Store.state.template.fields.filter(function (x) { return x.key === a; })[0];
    if (f) f.label = el.value;
    render();
  };
  Chg['tpl-tol'] = function (a, el) { Store.state.template.tol = Number(el.value) || 0.05; render(); };
  Chg['tpl-print-time'] = function (a, el) { Store.state.template.printTime = el.checked; render(); };
  Chg['tpl-footer'] = function (a, el) { Store.state.template.footerNote = el.value; render(); };
  Chg['exp-dev'] = function (a, el) {
    var st = Store.state.filter.exp;
    if (el.checked) { if (st.devices.indexOf(a) < 0) st.devices.push(a); }
    else st.devices = st.devices.filter(function (x) { return x !== a; });
    render();
  };
  ['exp-from', 'exp-to', 'exp-mode', 'exp-content', 'exp-week-dev', 'exp-week', 'exp-one'].forEach(function (k) {
    Chg[k] = function (a, el) {
      var st = Store.state.filter.exp;
      var map = { 'exp-from': 'from', 'exp-to': 'to', 'exp-mode': 'mode', 'exp-content': 'content', 'exp-week-dev': 'weekDev', 'exp-week': 'week', 'exp-one': 'one' };
      st[map[k]] = el.value;
      if (k === 'exp-week') st.week = el.value;
      render();
    };
  });
  Chg['exp-unverified'] = function (a, el) { Store.state.filter.exp.includeUnverified = el.checked; render(); };
  Chg['week-dev'] = function (a, el) { Store.state.filter.week.dev = el.value; render(); };
  Chg['week-mon'] = function (a, el) {
    Store.state.filter.week.monday = (function (s) {
      var d = APP.time.parseMin(s + ' 00:00');
      var wd = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - wd);
      return APP.time.fmtDate(d);
    })(el.value);
    render();
  };
  ['audit-from', 'audit-to', 'audit-user', 'audit-type'].forEach(function (k) {
    Chg[k] = function (a, el) {
      var map = { 'audit-from': 'from', 'audit-to': 'to', 'audit-user': 'user', 'audit-type': 'type' };
      Store.state.filter.audit[map[k]] = el.value;
      render();
    };
  });
  Chg['storage-quota'] = function () { /* 由"保存配额"按钮提交，避免输入过程反复重绘 */ };
  Chg['storage-demo'] = function (a, el) {
    Store.demoUsed(Number(el.value));
    render();
  };
  Chg['dev-form-ranges'] = null;

  /* ================= 事件绑定 ================= */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (!Act[act] || el.disabled) return;
    e.preventDefault();
    Act[act](el.getAttribute('data-arg'), el, e);
  });
  document.addEventListener('change', function (e) {
    var el = e.target.closest && e.target.closest('[data-change]');
    if (!el) return;
    var act = el.getAttribute('data-change');
    if (!Chg[act]) return;
    Chg[act](el.getAttribute('data-arg'), el, e);
  });
  window.addEventListener('hashchange', render);

  /* 30 分钟无操作自动登出（FR-104） */
  var idleSince = Date.now();
  ['click', 'keydown', 'mousemove', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, function () { idleSince = Date.now(); }, { passive: true });
  });
  setInterval(function () {
    if (Store.state.user && Date.now() - idleSince > 30 * 60 * 1000) {
      Store.logout('30 分钟无操作自动登出');
      Store.state.loginError = '会话因 30 分钟无操作自动登出，请重新登录（FR-104）。';
      go('/login');
    }
  }, 30000);

  window.Prototype = { go: go, render: render, Act: Act, Chg: Chg, ROUTES: ROUTES, match: match, defaultRoute: defaultRoute };

  /**
   * 深链演示：URL 形如  .../index.html?as=U003#/verify
   * 直接以指定演示账号打开某个页面，便于把页面链接发给客户直接查看。
   * 仅原型可用；真实系统必须通过账号 + 口令登录。
   */
  function bootstrap() {
    var m = /[?&]as=([A-Za-z0-9_]+)/.exec(location.search || '');
    if (m && Store.acc(m[1])) {
      Store.state.user = Store.acc(m[1]);
      Store.auditEvent('登录成功', '账号', m[1], '', '', '深链演示登录 ?as=' + m[1] + '（仅原型可用）');
      if (!location.hash || location.hash === '#/' || location.hash === '#') {
        location.hash = '#' + defaultRoute();
      }
    }
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();

})();
