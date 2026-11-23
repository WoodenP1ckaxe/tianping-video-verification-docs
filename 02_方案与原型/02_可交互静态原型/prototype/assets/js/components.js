/* ==========================================================================
   components.js — 通用界面组件（纯字符串渲染，可在无 DOM 环境下测试）
   无第三方依赖：图标为内联 SVG，图表为内联 SVG / CSS。
   ========================================================================== */
(function () {
  'use strict';

  var APP = window.APP;
  var Store = window.Store;

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------------- 图标（16×16 线性图标，stroke 跟随文字颜色） ---------------- */
  var ICONS = {
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    home: '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9.8V20h12V9.8"/>',
    upload: '<path d="M12 16V5"/><path d="m7.5 9.5 4.5-4.5 4.5 4.5"/><path d="M4 16v3h16v-3"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.4 2"/>',
    alert: '<path d="M12 4.5 21 20H3z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.4" r=".9" fill="currentColor" stroke="none"/>',
    file: '<path d="M6 3h7.5L18 7.5V21H6z"/><path d="M13.5 3v5H18"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><path d="M16.5 6.2a3 3 0 0 1 0 5.6"/><path d="M18 14.8c1.7.6 2.8 2.2 2.8 4.2"/>',
    shield: '<path d="M12 3.5 19 6v6c0 4.2-3 7-7 8.5-4-1.5-7-4.3-7-8.5V6z"/><path d="m9 12 2 2 4-4"/>',
    cpu: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v3M14 3v3M10 18v3M14 18v3M3 10h3M3 14h3M18 10h3M18 14h3"/>',
    printer: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
    device: '<path d="M12 3.5v5"/><path d="M6.5 8.5h11"/><path d="M8 8.5 6 14h12L16 8.5"/><path d="M4 20h16"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>',
    download: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 18.5V20h16v-1.5"/>',
    edit: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="m14.5 5.5 4 4"/>',
    trash: '<path d="M5 7h14"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7 7.5 20h9L17.5 7"/>',
    eye: '<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="8" r=".9" fill="currentColor" stroke="none"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    back: '<path d="M20 12H4"/><path d="m10 6-6 6 6 6"/>',
    camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/>',
    tag: '<path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8" cy="8" r="1.3"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 17V11M12.5 17V7M17 17v-4"/>',
    filter: '<path d="M4 5h16l-6 7v7l-4-2v-5z"/>'
  };

  function icon(name, size) {
    var p = ICONS[name] || ICONS.info;
    var s = size || 16;
    return '<svg class="ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }

  /* ---------------- 标签 ---------------- */
  function tag(text, tone, opt) {
    opt = opt || {};
    var cls = 'tag' + (tone ? ' tag-' + tone : '');
    if (opt.pulse) cls += ' tag-pulse';
    return '<span class="' + cls + '">' +
      (opt.dot === false ? '' : '<i class="dot"></i>') +
      (opt.icon ? icon(opt.icon, 12) : '') + esc(text) + '</span>';
  }

  function statusTag(status) {
    var tone = APP.STATUS_TONE[status];
    if (tone === undefined) tone = '';
    var pulse = status === '分析中';
    return tag(status, tone, { pulse: pulse, icon: status === '已复核确认' ? 'lock' : null });
  }

  /* ---------------- 卡片 / 表格 / 字段 ---------------- */
  function card(o) {
    o = o || {};
    var h = '';
    if (o.title || o.actions || o.sub) {
      h = '<div class="card-head"><div class="card-title"><span class="ct">' + esc(o.title || '') + '</span>' +
        (o.sub ? ' <span class="card-sub">' + esc(o.sub) + '</span>' : '') + '</div>' +
        (o.actions ? '<div class="card-actions">' + o.actions + '</div>' : '') + '</div>';
    }
    var b = '<div class="card-body' + (o.flush ? ' flush' : o.tight ? ' tight' : '') + '">' + (o.body || '') + '</div>';
    var f = o.foot ? '<div class="card-foot">' + o.foot + '</div>' : '';
    return '<section class="card' + (o.className ? ' ' + o.className : '') + '">' + h + b + f + '</section>';
  }

  /**
   * table({cols:[{t,k,w,align,cls,render}], rows:[], empty, compact})
   */
  function table(o) {
    var cols = o.cols || [], rows = o.rows || [];
    var th = cols.map(function (c) {
      var cls = (c.align === 'right' ? 'num' : c.align === 'center' ? 'ctr' : '') + (c.cls ? ' ' + c.cls : '');
      return '<th class="' + cls.trim() + '"' + (c.w ? ' style="width:' + c.w + '"' : '') + '>' + (c.t || '') + '</th>';
    }).join('');
    var body = rows.length ? rows.map(function (r, i) {
      var tds = cols.map(function (c) {
        var cls = (c.align === 'right' ? 'num' : c.align === 'center' ? 'ctr' : '') +
          (c.cellCls ? ' ' + (typeof c.cellCls === 'function' ? c.cellCls(r) : c.cellCls) : '');
        var v = c.render ? c.render(r, i) : (c.k ? r[c.k] : '');
        return '<td class="' + cls.trim() + '">' + (v === null || v === undefined ? '' : v) + '</td>';
      }).join('');
      var rowCls = o.rowClass ? o.rowClass(r) : '';
      return '<tr class="' + rowCls + '">' + tds + '</tr>';
    }).join('') : '<tr><td colspan="' + cols.length + '"><div class="empty">' + esc(o.empty || '暂无数据') + '</div></td></tr>';
    return '<div class="tbl-wrap"><table class="tbl' + (o.compact ? ' compact' : '') + '"><thead><tr>' + th +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function pager(total, page, size) {
    var pages = Math.max(1, Math.ceil(total / size));
    var btns = '';
    for (var i = 1; i <= pages && i <= 8; i++) {
      btns += '<button class="pg' + (i === page ? ' on' : '') + '" data-act="page" data-arg="' + i + '">' + i + '</button>';
    }
    return '<div class="pager"><span>共 ' + total + ' 条记录，第 ' + page + '/' + pages + ' 页</span>' +
      '<span class="pages">' + btns + '</span></div>';
  }

  function field(o) {
    return '<div class="field">' +
      (o.label ? '<div class="field-label">' + esc(o.label) + (o.required ? '<span class="req">*</span>' : '') +
        (o.badge || '') + '</div>' : '') +
      (o.control || '') +
      (o.hint ? '<div class="field-hint">' + o.hint + '</div>' : '') +
      '</div>';
  }

  function input(name, value, opt) {
    opt = opt || {};
    return '<input class="input' + (opt.cls ? ' ' + opt.cls : '') + '" name="' + name + '" ' +
      'value="' + esc(value === null || value === undefined ? '' : value) + '" ' +
      (opt.type ? 'type="' + opt.type + '"' : '') + (opt.placeholder ? ' placeholder="' + esc(opt.placeholder) + '"' : '') +
      (opt.attrs || '') + (opt.disabled ? ' disabled' : '') + '>';
  }

  function select(name, value, options, opt) {
    opt = opt || {};
    var opts = options.map(function (o) {
      var v = typeof o === 'string' ? o : o.v, t = typeof o === 'string' ? o : o.t;
      return '<option value="' + esc(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
    if (opt.placeholder) opts = '<option value="">' + esc(opt.placeholder) + '</option>' + opts;
    return '<select class="select' + (opt.cls ? ' ' + opt.cls : '') + '" name="' + name + '"' +
      (opt.attrs || '') + (opt.disabled ? ' disabled' : '') + '>' + opts + '</select>';
  }

  function textarea(name, value, opt) {
    opt = opt || {};
    return '<textarea class="textarea' + (opt.cls ? ' ' + opt.cls : '') + '" name="' + name + '"' +
      (opt.attrs || '') + (opt.disabled ? ' disabled' : '') + '>' + esc(value || '') + '</textarea>';
  }

  function alert(tone, title, text, opt) {
    opt = opt || {};
    var icons = { info: 'info', ok: 'check', warn: 'alert', danger: 'alert', flat: 'info', purple: 'info' };
    return '<div class="alert alert-' + tone + '"><span class="a-ico">' + icon(opt.icon || icons[tone] || 'info', 18) + '</span><div>' +
      (title ? '<b>' + title + '</b>' : '') + (text || '') + '</div></div>';
  }

  /* ---------------- 需求标注（可一键隐藏） ---------------- */
  function reqStrip(pageKey) {
    if (!Store.state.showTrace) return '';
    var frs = APP.REQ_MAP[pageKey] || [];
    if (!frs.length) return '';
    return '<div class="req-strip no-print"><span>本页覆盖需求</span><b>' +
      frs.map(function (f) { return '<span class="req-chip">' + esc(f) + '</span>'; }).join(' ') +
      '</b><span class="muted small">（顶栏"需求标注"开关可隐藏，隐藏后即为正式系统观感）</span></div>';
  }

  /* ---------------- 布局骨架 ---------------- */
  var NAV_GROUPS = [
    {
      group: '演示与概览', items: [
        { route: '#/overview', label: '演示导览与需求覆盖', iconName: 'compass', roles: ['admin', 'inspector', 'verifier'] }
      ]
    },
    {
      group: '日常工作', items: [
        { route: '#/workbench', label: '工作台', iconName: 'home', roles: ['inspector'] },
        { route: '#/upload', label: '视频上传', iconName: 'upload', roles: ['inspector'] },
        {
          route: '#/tasks', iconName: 'list', roles: ['admin', 'inspector', 'verifier'],
          label: '我的上传与任务',
          labelByRole: { admin: '分析任务与队列（全部）', verifier: '分析任务与队列（只读）' }
        },
        { route: '#/verify', label: '待复核', iconName: 'check', roles: ['verifier'], badge: 'pending' },
        { route: '#/records', label: '记录查询', iconName: 'search', roles: ['admin', 'inspector', 'verifier'] },
        { route: '#/export', label: '导出与打印', iconName: 'printer', roles: ['admin', 'inspector', 'verifier'] }
      ]
    },
    {
      group: '维护与配置', items: [
        { route: '#/masterdata', label: '天平档案与砝码盒', iconName: 'device', roles: ['admin', 'verifier'] },
        { route: '#/template', label: '记录模板配置', iconName: 'file', roles: ['admin', 'verifier'] },
        { route: '#/print/blank', label: '空白表与卡片清单', iconName: 'tag', roles: ['admin', 'verifier'] }
      ]
    },
    {
      group: '系统管理', items: [
        { route: '#/accounts', label: '账号与角色', iconName: 'users', roles: ['admin'] },
        { route: '#/audit', label: '审计日志', iconName: 'shield', roles: ['admin'] },
        { route: '#/system', label: '存储与运行状态', iconName: 'cpu', roles: ['admin'] }
      ]
    }
  ];

  function navHtml(route) {
    var user = Store.state.user;
    if (!user) return '';
    var pending = Store.pendingVerify().length;
    var out = '';
    NAV_GROUPS.forEach(function (g) {
      var items = g.items.filter(function (it) { return it.roles.indexOf(user.role) >= 0; });
      if (!items.length) return;
      out += '<div class="nav-group"><div class="nav-title">' + g.group + '</div>';
      items.forEach(function (it) {
        var label = (it.labelByRole && it.labelByRole[user.role]) || it.label;
        var active = route === it.route || (it.route !== '#/records' && route.indexOf(it.route) === 0);
        var badge = '';
        if (it.badge === 'pending' && pending > 0) badge = '<span class="nav-badge">' + pending + '</span>';
        out += '<a class="nav-item' + (active ? ' active' : '') + '" href="' + it.route + '">' +
          '<span class="ni">' + icon(it.iconName, 17) + '</span>' + esc(label) + badge + '</a>';
      });
      out += '</div>';
    });
    return out;
  }

  function topbar() {
    var user = Store.state.user;
    var opts = Store.state.accounts.filter(function (a) { return a.status === '启用'; }).map(function (a) {
      return { v: a.id, t: a.id + ' ' + a.name + '（' + Store.roleLabel(a.role) + '）' };
    });
    return '<header class="topbar no-print">' +
      '<div class="brand"><span class="brand-logo">' + icon('device', 19) + '</span>' +
      '<span class="brand-text"><b>天平校验视频分析系统</b><i>前端原型 · 客户需求确认版（V0.9 需求基线）</i></span></div>' +
      '<div class="top-right">' +
      '<span class="demo-flag">原型演示数据 · 非真实系统</span>' +
      '<label class="switch" title="显示 / 隐藏页面上的需求编号标注"><input type="checkbox" data-change="toggle-trace"' +
      (Store.state.showTrace ? ' checked' : '') + '><span class="switch-track"></span><span class="switch-label">需求标注</span></label>' +
      '<select class="select sm" style="width:auto" data-change="switch-user" title="切换演示账号（真实系统不允许，仅原型演示用）">' +
      opts.map(function (o) {
        return '<option value="' + o.v + '"' + (user && user.id === o.v ? ' selected' : '') + '>' + esc(o.t) + '</option>';
      }).join('') + '</select>' +
      '<div class="user-chip"><span class="avatar">' + esc(user ? user.name.slice(0, 1) : '—') + '</span>' +
      '<span class="user-meta"><b>' + esc(user ? user.name : '') + '</b><i>' + esc(user ? Store.roleLabel(user.role) : '') + '</i></span>' +
      '<button class="btn btn-sm" data-act="logout">退出</button></div>' +
      '</div></header>';
  }

  function page(o) {
    return reqStrip(o.pageKey) +
      '<div class="page-head"><div><h1 class="page-title">' + o.title + '</h1>' +
      (o.sub ? '<p class="page-sub">' + o.sub + '</p>' : '') + '</div>' +
      (o.actions ? '<div class="page-actions no-print">' + o.actions + '</div>' : '') + '</div>' +
      (o.body || '');
  }

  function shell(contentHtml, route) {
    return topbar() + '<div class="app-body"><aside class="sidebar no-print">' + navHtml(route) +
      '</aside><main class="content">' + contentHtml + '</main></div>';
  }

  function blankShell(contentHtml) {
    return '<main class="content" style="padding:0">' + contentHtml + '</main>';
  }

  /* ---------------- 弹窗与轻提示 ---------------- */
  function openModal(cfg) {
    var root = document.getElementById('modal-root');
    if (!root) return;
    var foot = (cfg.buttons || []).map(function (b) {
      return '<button class="btn ' + (b.cls || '') + '" data-act="modal-btn" data-arg="' + (b.act || '') + '">' + b.label + '</button>';
    }).join('');
    root.innerHTML = '<div class="modal-mask" data-act="modal-mask"><div class="modal ' + (cfg.size || '') + '">' +
      '<div class="modal-head"><h3>' + cfg.title + '</h3>' + (cfg.sub ? '<p>' + cfg.sub + '</p>' : '') + '</div>' +
      '<div class="modal-body">' + (cfg.body || '') + '</div>' +
      (foot ? '<div class="modal-foot">' + foot + '</div>' : '') + '</div></div>';
    Store.state.modal = cfg;
  }

  function closeModal() {
    var root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
    Store.state.modal = null;
  }

  function toast(msg, tone) {
    var root = document.getElementById('toast-root');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'toast' + (tone ? ' ' + tone : '');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () { el.remove(); }, 3600);
  }

  /* ---------------- 视频占位播放器（不加载任何真实媒体） ---------------- */
  function player(o) {
    var rec = o.record, device = o.device;
    var ev = APP.Rules.evaluate(rec, device);
    var active = o.activeKey || (ev.items[0] && ev.items[0].key);
    var it = ev.items.filter(function (x) { return x.key === active; })[0] || ev.items[0];
    var total = rec.duration || 390;
    var off = it ? it.ro.off : 0;
    var pct = Math.min(100, Math.round(off / total * 100));
    var markers = ev.items.map(function (x) {
      var left = Math.min(99, Math.round(x.ro.off / total * 100));
      return '<button class="marker' + (x.key === active ? ' on' : '') + '" style="left:' + left + '%" ' +
        'data-act="player-jump" data-arg="' + x.key + '" title="跳转到 ' + x.key + ' 读数时间点">' +
        '<i>' + x.key.replace('I', '').replace('-', '.') + '</i></button>';
    }).join('');
    return '<div class="player">' +
      '<div class="player-screen' + (o.tall ? ' tall' : '') + '">' +
      '<div class="ph-frame"></div>' +
      '<span class="ph-tag tl">手机固定支架拍摄 · 竖屏 544×960 · H.264</span>' +
      '<span class="ph-tag bl">' + esc(rec.file || '') + '</span>' +
      '<span class="ph-tag br">' + esc(APP.time.dur(off)) + ' / ' + esc(APP.time.dur(total)) + '</span>' +
      '<div class="ph-device"><span>天平显示区（识别区域）</span>' +
      '<div class="lcd' + (it ? '' : ' lcd-dim') + '"><span class="lcd-val">' +
      (it && !it.missing ? APP.Rules.fmt(it.value, it.dec) : '—') + '</span><span class="lcd-unit">g</span></div>' +
      '</div></div>' +
      '<div class="player-bar"><button class="pb-btn" data-act="player-jump" data-arg="' + (it ? it.key : '') + '">' +
      icon('play', 12) + '</button><div class="track"><div class="fill" style="width:' + pct + '%"></div>' + markers + '</div>' +
      '<span class="num">' + esc(APP.time.dur(off)) + '</span></div>' +
      '<div class="player-note">原型不加载真实视频：此处为占位播放器。点击进度条上的刻线可按 9 次读数时间点跳转（FR-810 / FR-1009）；' +
      '当前定位：' + (it ? '<b>' + it.key + '</b> · 视频内偏移 ' + esc(APP.time.dur(off)) + ' · 读数时间 ' +
        esc(APP.time.timeAt(rec.startTime, it.ro.off)) : '—') + '</div>' +
      '</div>';
  }

  /* ---------------- 识别截图占位（9~18 张，长期保留） ---------------- */
  function shots(record, device, activeKey) {
    var ev = APP.Rules.evaluate(record, device);
    return '<div class="shot-grid">' + ev.items.map(function (it) {
      var low = APP.Rules.isLowConf(it.conf);
      var tone = 'shot' + (low ? ' low' : '') + (it.stable === false ? ' unstable' : '') + (it.key === activeKey ? ' on' : '');
      var frames = '<div class="frames">' + [0, 1, 2, 3, 4].map(function (i) {
        return '<i class="' + (i <= 3 ? 'on' : '') + '"></i>';
      }).join('') + '</div>';
      return '<div class="' + tone + '" data-act="player-jump" data-arg="' + it.key + '" style="cursor:pointer">' +
        '<div class="shot-hd"><span>' + it.key + '</span><span>' + it.rangeLabel + '</span></div>' +
        '<div class="shot-lcd"><span class="v">' + (it.missing ? '—' : APP.Rules.fmt(it.value, it.dec)) + '</span><span class="u">g</span></div>' +
        frames +
        '<div class="shot-ft"><span>' + esc(APP.time.dur(it.ro.off)) + '</span>' +
        '<span>' + (it.missing ? '未识别' : (it.stable === false ? '不稳定' : '稳定')) +
        ' · ' + (Math.round(it.conf * 1000) / 10) + '%</span></div></div>';
    }).join('') + '</div>';
  }

  /* ---------------- 小型图表 ---------------- */
  function donut(pct, centerText, centerSub, color) {
    var r = 56, c = 2 * Math.PI * r, on = c * Math.min(100, Math.max(0, pct)) / 100;
    var col = color || (pct >= 90 ? '#dc2626' : pct >= 75 ? '#d97706' : '#2563eb');
    return '<div class="donut"><svg width="132" height="132" viewBox="0 0 132 132">' +
      '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="#eef1f6" stroke-width="12"/>' +
      '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="12" stroke-linecap="round" ' +
      'stroke-dasharray="' + on + ' ' + (c - on) + '"/></svg>' +
      '<div class="dc"><div><b>' + centerText + '</b><i>' + (centerSub || '') + '</i></div></div></div>';
  }

  function bar(pct) {
    var tone = pct >= 90 ? 'danger' : pct >= 75 ? 'warn' : 'ok';
    return '<div class="bar"><div class="bar-fill ' + tone + '" style="width:' + Math.min(100, pct) + '%"></div></div>';
  }

  /** 迷你柱状图（用于周完成情况，非示值曲线 —— FR-1004 明确不提供图形化示值曲线） */
  function miniBars(items) {
    var max = Math.max.apply(null, items.map(function (i) { return i.v; }).concat([1]));
    return '<div class="mini-bars">' + items.map(function (i) {
      var h = Math.max(6, Math.round(i.v / max * 100));
      return '<div class="mb"><i class="' + (i.tone || '') + '" style="height:' + h + '%"></i><span>' + esc(i.l) + '</span></div>';
    }).join('') + '</div>';
  }

  function kv(pairs) {
    return '<dl class="kv">' + pairs.map(function (p) {
      return '<dt>' + esc(p[0]) + '</dt><dd>' + p[1] + '</dd>';
    }).join('') + '</dl>';
  }

  function sig(o) {
    if (!o) return '<div class="sig pending"><span class="sig-ico">' + icon('clock', 17) + '</span>' +
      '<div><div class="sig-name">待签名</div><div class="sig-meta">尚未完成电子签名</div></div></div>';
    return '<div class="sig ' + (o.locked ? 'locked' : '') + '"><span class="sig-ico">' +
      icon(o.locked ? 'lock' : 'check', 17) + '</span><div>' +
      '<div class="sig-name">' + esc(o.name) + '<span class="muted small"> · ' + esc(o.role || '') + '</span></div>' +
      '<div class="sig-meta">' + esc(o.time || '') + (o.from ? ' · ' + esc(o.from) : '') + '</div>' +
      (o.note ? '<div class="sig-meta">' + esc(o.note) + '</div>' : '') + '</div></div>';
  }

  window.UI = {
    esc: esc, icon: icon, tag: tag, statusTag: statusTag, card: card, table: table, pager: pager,
    field: field, input: input, select: select, textarea: textarea, alert: alert, reqStrip: reqStrip,
    page: page, shell: shell, blankShell: blankShell, navHtml: navHtml, topbar: topbar,
    openModal: openModal, closeModal: closeModal, toast: toast,
    player: player, shots: shots, donut: donut, bar: bar, miniBars: miniBars, kv: kv, sig: sig,
    NAV_GROUPS: NAV_GROUPS
  };
})();
