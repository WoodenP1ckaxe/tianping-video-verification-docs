/* ==========================================================================
   views-common.js — 登录、演示导览、记录查询、记录详情、天平历史汇总
   ========================================================================== */
(function () {
  'use strict';

  var APP = window.APP, Store = window.Store, UI = window.UI, R = APP.Rules, T = APP.time;
  var Views = window.Views = window.Views || {};

  function roleTag(role) { return UI.tag(Store.roleLabel(role), APP.ROLES[role].color); }

  /* ======================================================================
     1. 登录（FR-101、FR-103、FR-104、FR-106、FR-109、FR-110）
     ====================================================================== */
  Views.login = function () {
    var err = Store.state.loginError;
    var hero = '<div class="login-hero">' +
      '<div><div class="lh-brand"><span class="brand-logo">' + UI.icon('device', 22) + '</span>' +
      '<div class="brand-text" style="color:#fff"><b style="font-size:16px">天平校验视频分析系统</b>' +
      '<i style="color:rgba(255,255,255,.7)">Front-end Prototype · 客户需求确认版</i></div></div>' +
      '<h1>以视频为唯一原始证据<br>把每日天平校验变成可查询、可复核、可导出的电子记录</h1>' +
      '<p class="lead">检验人员拍摄固定支架视频并上传，系统自动识别人员卡、设备卡、9 次称重示值与读数时间，' +
      '按 |I − L| ≤ 0.05% × L 自动判定"通过 / 不通过"，经检验人员一键提交、复核确认人员电子签名后归档，' +
      '并按现有纸质记录表版式导出与打印。</p>' +
      '<div class="lh-feats">' +
      '<div class="lh-feat"><span class="num-badge">1</span><div><b>检验人员 · 三步操作</b><br>上传视频 → 核对并一键提交 → 查询导出（QR-004）</div></div>' +
      '<div class="lh-feat"><span class="num-badge">2</span><div><b>复核确认人员 · 两步操作</b><br>查看记录 → 电子签名确认 / 退回修改</div></div>' +
      '<div class="lh-feat"><span class="num-badge">3</span><div><b>管理员</b><br>账号与权限、主数据、审计日志、存储容量与运行状态</div></div>' +
      '</div></div>' +
      '<div class="lh-foot">纯内网离线运行 · Windows / Linux 双平台容器化部署 · 无 GPU · 中文界面<br>' +
      '本页面为需求确认用前端原型，不含真实业务逻辑、数据库与识别能力。' +
      '</div></div>';

    var cards = Store.state.accounts.map(function (a) {
      var off = a.status === '停用';
      return '<button class="acct-card' + (off ? ' off' : '') + '" data-act="login" data-arg="' + a.id + '">' +
        '<span class="acct-ava" style="background:' + (off ? '#f1f3f6;color:#8b95a7' :
          a.role === 'admin' ? '#e8eefc;color:#1d4ed8' : a.role === 'inspector' ? '#e8f2ff;color:#2563eb' : '#f3edff;color:#7c3aed') +
        '">' + UI.esc(a.name.slice(0, 1)) + '</span>' +
        '<span class="acct-meta"><b>' + UI.esc(a.name) + ' <span class="small muted">' + a.id + '</span></b>' +
        '<i>' + Store.roleLabel(a.role) + (a.firstLogin ? ' · 首次登录需改密' : '') +
        ' · 最近登录 ' + UI.esc(a.lastLogin) + '</i></span>' +
        (off ? UI.tag('停用', 'muted') : UI.tag('启用', 'ok')) + '</button>';
    }).join('');

    var panel = '<div class="login-panel">' +
      '<h2 style="font-size:20px">登录</h2>' +
      '<p class="muted small" style="margin-top:6px">选择演示账号即可一键登录；也可手工输入账号与口令验证登录规则。</p>' +
      (err ? UI.alert('danger', '登录失败', err) : '') +
      '<div class="acct-grid">' + cards + '</div>' +
      '<div class="sep-line">或手工登录</div>' +
      '<form data-act="login-manual" onsubmit="return false">' +
      UI.field({
        label: '账号', required: true,
        control: UI.input('acc', '', { placeholder: '账号编号，如 U001' })
      }) +
      UI.field({
        label: '口令', required: true,
        control: UI.input('pwd', '', { type: 'password', placeholder: '演示口令 123456' }),
        hint: '口令长度不少于 8 位且同时包含字母与数字；连续 5 次错误锁定账号 10 分钟；30 分钟无操作自动登出（FR-104）'
      }) +
      '<button class="btn btn-pri" style="width:100%" data-act="login-manual">登录</button>' +
      '</form>' +
      '<div class="role-note">' +
      '<b>演示提示</b><br>' +
      '· 点击 <b>U001 李一</b> 可看到"首次登录强制修改口令"（FR-104）；<br>' +
      '· 点击 <b>U004 王三</b> 可看到"停用账号无法登录，历史记录不受影响"（FR-109）；<br>' +
      '· 登录后可在顶栏下拉切换演示账号，用于完整走通"提交 → 复核"闭环（真实系统禁止同一账号同时承担提交与复核，FR-110）。' +
      '<br>· 想先看全貌？登录管理员后打开左侧「演示导览与需求覆盖」，26 条验收用例已逐条映射到页面。' +
      '</div></div>';

    return { html: UI.blankShell('<div class="login-page">' + hero + panel + '</div>'), pageKey: 'login', raw: true };
  };

  /* ======================================================================
     2. 演示导览与需求覆盖（追溯）
     ====================================================================== */
  Views.overview = function () {
    var paths = APP.DEMO_PATHS.map(function (p) {
      return '<div class="path-card"><h3><span class="pc-role">' + roleTag(p.role) + '</span>' + UI.esc(p.title) + '</h3>' +
        '<div class="pc-sub">' + UI.esc(p.summary) + ' · 演示账号 ' + UI.esc(p.account) + '</div>' +
        p.steps.map(function (s, i) {
          return '<div class="path-step"><span class="ps-n">' + (i + 1) + '</span>' +
            '<span class="ps-t"><b>' + UI.esc(s.t) + '</b><span>' + UI.esc(s.d) + '</span></span>' +
            '<a class="btn btn-sm" href="' + s.route + '">打开</a></div>';
        }).join('') + '</div>';
    }).join('');

    var acRows = APP.AC_CASES.map(function (c) {
      return {
        id: c.id,
        chk: '<input type="checkbox" class="cb" data-change="ac-check" data-arg="' + c.id + '"' +
          (Store.state.checked[c.id] ? ' checked' : '') + '>',
        name: UI.esc(c.name),
        expected: UI.esc(c.expected),
        page: c.noUi ? '<span class="muted">' + UI.esc(c.page) + '</span>'
          : '<a href="' + c.route + '">' + UI.esc(c.page) + '</a>',
        frs: '<span class="small muted">' + UI.esc(c.frs) + '</span>'
      };
    });
    var done = APP.AC_CASES.filter(function (c) { return Store.state.checked[c.id]; }).length;

    var acTable = UI.card({
      title: '验收用例对照表（附录 E）',
      sub: '共 ' + APP.AC_CASES.length + ' 条，已勾选 ' + done + ' 条',
      actions: '<button class="btn btn-sm" data-act="ac-clear">清空勾选</button>',
      flush: true,
      body: UI.table({
        compact: true,
        cols: [
          { t: '确认', w: '52px', align: 'center', render: function (r) { return r.chk; } },
          { t: '用例编号', w: '88px', render: function (r) { return '<span class="num">' + r.id + '</span>'; } },
          { t: '用例名称', w: '210px', render: function (r) { return r.name; } },
          { t: '预期结果', render: function (r) { return r.expected; } },
          { t: '演示页面', w: '190px', render: function (r) { return r.page; } },
          { t: '覆盖需求', w: '230px', render: function (r) { return r.frs; } }
        ],
        rows: acRows
      })
    });

    var pageTable = UI.card({
      title: '页面与需求索引',
      sub: '原型共 20 个界面',
      flush: true,
      body: UI.table({
        compact: true,
        cols: [
          { t: '页面', w: '230px', render: function (r) { return '<a href="' + r.route + '">' + UI.esc(r.title) + '</a>'; } },
          { t: '可见角色', w: '180px', render: function (r) { return UI.esc(r.roles); } },
          { t: '覆盖需求', render: function (r) { return '<span class="small">' + UI.esc(r.frs) + '</span>'; } }
        ],
        rows: APP.PAGE_INDEX
      })
    });

    var nonUi = APP.NON_UI.map(function (n) {
      return '<div class="path-card" style="margin-bottom:12px"><h3>' + UI.tag(n.key, 'muted') + UI.esc(n.title) + '</h3>' +
        '<div class="pc-sub" style="margin-bottom:0">' + UI.esc(n.desc) + '</div></div>';
    }).join('');

    var body =
      UI.alert('info', '本原型用于逐页确认需求，而非演示生产系统',
        '页面顶部淡色条标注了本页覆盖的需求编号（可在顶栏用"需求标注"开关隐藏）。下方对照表可直接跳转到对应页面，' +
        '客户逐条勾选即可形成评审记录。') +
      '<div class="grid grid-3" style="margin-bottom:16px">' + paths + '</div>' +
      acTable + pageTable +
      UI.card({ title: '不通过界面演示的需求范围', body: nonUi });

    return {
      html: UI.shell(UI.page({
        pageKey: 'overview',
        title: '演示导览与需求覆盖',
        sub: '三条推荐演示路径 · 26 条验收用例 → 演示页面映射 · 20 个界面与需求编号索引',
        actions: '<button class="btn" data-act="nav-first">从第一步开始演示</button>' +
          '<button class="btn btn-pri" data-act="toast-print">生成评审用对照清单</button>',
        body: body
      }), '/overview'),
      pageKey: 'overview'
    };
  };

  /* ======================================================================
     3. 记录查询（FR-1001、FR-1002、FR-1007、FR-1008、FR-812）
     ====================================================================== */
  function recordConclusion(r) {
    var d = Store.dev(r.device);
    return R.evaluate(r, d).conclusion;
  }

  Views.records = function () {
    var f = Store.state.filter.records;
    var devOpts = Store.state.devices.map(function (d) { return { v: d.id, t: d.id + ' · ' + d.uniqueNo }; });
    var insOpts = Store.state.accounts.filter(function (a) { return a.role === 'inspector'; })
      .map(function (a) { return { v: a.id, t: a.name + '（' + a.id + '）' }; });
    var rows = Store.recordRows({
      device: f.device, from: f.from, to: f.to, inspector: f.inspector,
      conclusion: f.conclusion, status: f.status
    });
    var total = rows.length;
    var page = Math.min(f.page, Math.max(1, Math.ceil(total / f.size)));
    var pageRows = rows.slice((page - 1) * f.size, page * f.size);

    var toolbar = '<div class="tbl-tools">' +
      '<div class="field" style="margin:0"><div class="field-label">天平编号</div>' +
      UI.select('device', f.device, devOpts, { placeholder: '全部天平', cls: 'sm', attrs: ' data-change="filter-device"' }) + '</div>' +
      '<div class="field" style="margin:0"><div class="field-label">校验日期起</div>' +
      UI.input('from', f.from, { type: 'date', cls: 'sm', attrs: ' data-change="filter-from"' }) + '</div>' +
      '<div class="field" style="margin:0"><div class="field-label">校验日期止</div>' +
      UI.input('to', f.to, { type: 'date', cls: 'sm', attrs: ' data-change="filter-to"' }) + '</div>' +
      '<div class="field" style="margin:0"><div class="field-label">检验人员</div>' +
      UI.select('inspector', f.inspector, insOpts, { placeholder: '全部', cls: 'sm', attrs: ' data-change="filter-inspector"' }) + '</div>' +
      '<div class="field" style="margin:0"><div class="field-label">判定结论</div>' +
      UI.select('conclusion', f.conclusion, ['通过', '不通过'], { placeholder: '全部', cls: 'sm', attrs: ' data-change="filter-conclusion"' }) + '</div>' +
      '<div class="field" style="margin:0"><div class="field-label">复核状态</div>' +
      UI.select('status', f.status, ['待提交', '已提交', '已复核确认', '已作废'], { placeholder: '全部', cls: 'sm', attrs: ' data-change="filter-status"' }) + '</div>' +
      '<button class="btn btn-sm" data-act="filter-reset">重置</button>' +
      '<button class="btn btn-sm" data-act="export-list">导出清单（Excel/CSV）</button>' +
      '</div>';

    var table = UI.table({
      cols: [
        { t: '校验日期', w: '104px', render: function (r) { return '<span class="num">' + r.date + '</span>'; } },
        { t: '记录编号', w: '158px', render: function (r) { return '<a class="num" href="#/records/' + r.id + '">' + r.id + '</a>'; } },
        { t: '天平编号', w: '88px', render: function (r) { return '<a href="#/history/' + r.device + '">' + r.device + '</a>'; } },
        { t: '天平唯一号', w: '124px', render: function (r) { var d = Store.dev(r.device); return '<span class="num small">' + UI.esc(d ? d.uniqueNo : '—') + '</span>'; } },
        { t: '砝码盒编号', w: '110px', render: function (r) { return '<span class="num small">' + UI.esc(r.box || '—') + '</span>'; } },
        { t: '检验人员', w: '96px', render: function (r) { return UI.esc(Store.name(r.inspector)); } },
        {
          t: '判定结论', w: '96px', align: 'center', render: function (r) {
            var c = recordConclusion(r);
            if (r.status === '已作废') return UI.tag('已作废', 'muted');
            return UI.tag(c, c === '通过' ? 'ok' : 'danger');
          }
        },
        { t: '复核状态', w: '110px', align: 'center', render: function (r) { return UI.statusTag(r.status); } },
        { t: '提交时间', w: '140px', render: function (r) { return '<span class="num small">' + (r.submittedAt || '—') + '</span>'; } },
        { t: '复核时间', w: '140px', render: function (r) { return '<span class="num small">' + (r.verifiedAt || '—') + '</span>'; } },
        {
          t: '操作', w: '150px', render: function (r) {
            var a = '<a class="btn-link" href="#/records/' + r.id + '">详情</a>' +
              ' <a class="btn-link" href="#/print/' + r.id + '">打印预览</a>';
            if (r.status === '待提交' && Store.mine(r.inspector)) a += ' <a class="btn-link" href="#/review/' + r.id + '">核对</a>';
            return a;
          }
        }
      ],
      rows: pageRows,
      empty: '没有符合条件的记录，请调整筛选条件',
      rowClass: function (r) { return r.status === '已作废' ? 'row-danger' : ''; }
    });

    var body = UI.card({
      title: '校验记录', sub: '所有角色均可查询全部记录（跨检验人员、跨天平，FR-1007）',
      actions: '<span class="small muted">查询与导出均写入审计日志（FR-1008）</span>',
      flush: true,
      body: toolbar + table + UI.pager(total, page, f.size)
    });

    return {
      html: UI.shell(UI.page({
        pageKey: 'records',
        title: '记录查询',
        sub: '按天平编号（可多选）、日期段查询，并可按检验人员、判定结论、复核状态进一步筛选（FR-1001、FR-1002）',
        actions: '<a class="btn" href="#/history/' + (f.device || 'F001') + '">查看该天平历史汇总</a>' +
          '<a class="btn btn-pri" href="#/export">批量导出 PDF</a>',
        body: body
      }), '/records'),
      pageKey: 'records'
    };
  };

  /* ======================================================================
     4. 记录详情（FR-803、FR-804、FR-810、FR-811、FR-1009、FR-1101）
     ====================================================================== */
  Views.recordDetail = function (id) {
    var r = Store.rec(id);
    if (!r) return { html: UI.shell(UI.page({ pageKey: 'recordDetail', title: '记录不存在', body: UI.alert('warn', '未找到记录', '记录编号 ' + UI.esc(id) + ' 不存在。') }), '/records'), pageKey: 'recordDetail' };
    var d = Store.dev(r.device);
    var ev = R.evaluate(r, d);
    var active = (Store.state.player.recordId === r.id && Store.state.player.key) ||
      (ev.items[0] && ev.items[0].key);

    /* 状态提示条 */
    var banner = '';
    if (r.status === '已作废') {
      banner = UI.alert('danger', '该记录已作废（只读）',
        '作废人：' + UI.esc(Store.name(r.voidBy)) + ' · ' + UI.esc(r.voidAt) + ' · 理由：' + UI.esc(r.voidReason) +
        '。作废记录不参与统计、不参与批量导出；单条导出时带"已作废"水印（FR-809）。');
    } else if (r.status === '已复核确认') {
      banner = UI.alert('ok', '该记录已复核确认并锁定',
        '复核确认人：' + UI.esc(Store.name(r.verifiedBy)) + ' · ' + UI.esc(r.verifiedAt) +
        '。已复核确认状态下所有字段不可修改，如确需更正，由管理员作废记录并重新拍摄校验（FR-808）。');
    } else if (r.status === '已提交') {
      banner = UI.alert('info', '该记录已提交，等待复核确认',
        '提交人：' + UI.esc(Store.name(r.submittedBy)) + ' · ' + UI.esc(r.submittedAt) +
        '。此状态下检验人员仅可修改"备注"字段，修改留痕，复核确认人员可见（FR-807）。');
    } else if (r.status === '待提交') {
      banner = UI.alert('warn', '该记录待提交（草稿）',
        '分析已完成并生成记录草稿，需由检验人员核对低置信字段后一键提交。' +
        (r.rejectedBy ? ' 本记录曾被 ' + UI.esc(Store.name(r.rejectedBy)) + ' 于 ' + UI.esc(r.rejectedAt) + ' 退回，理由：' + UI.esc(r.rejectReason) : '') +
        '（FR-804）');
    }

    /* 基本信息 + 判定结论 */
    var info = UI.card({
      title: '记录基本信息',
      body: '<div class="kv-2">' +
        UI.kv([['记录编号', '<span class="num">' + r.id + '</span>']]) +
        UI.kv([['校验日期', '<span class="num">' + r.date + '</span>'], ['拍摄开始时间', '<span class="num">' + UI.esc(r.startTime) + '</span>']]) +
        '</div><div class="kv-2" style="margin-top:10px">' +
        UI.kv([
          ['天平编号', d.id + ' · ' + UI.esc(d.dept)],
          ['天平唯一号', '<span class="num">' + UI.esc(d.uniqueNo) + '</span>'],
          ['Max / d', d.range1.max + 'g / ' + d.range1.d + 'mg' + (d.range2 ? '；' + d.range2.max + 'g / ' + d.range2.d + 'mg（双量程）' : '（单量程）')],
          ['内部校正方式', UI.esc(d.internalCal)],
          ['砝码盒编号', '<span class="num">' + UI.esc(r.box || '—') + '</span>'],
          ['检验人员', UI.esc(Store.name(r.inspector)) + '（' + r.inspector + '）']
        ]) +
        UI.kv([
          ['清洁', UI.esc(r.cleanliness)], ['水平调节', UI.esc(r.level)],
          ['内部校正是否通过', UI.esc(r.internalCal)], ['备注', UI.esc(r.remark)],
          ['原始视频', UI.esc(r.file) + '（' + r.fileSize + 'MB）'],
          ['文件校验值', '<span class="num small">SHA-256 ' + UI.esc(r.sha) + '…</span>']
        ]) + '</div>'
    });

    var concl = UI.card({
      title: '判定结论', sub: '由系统自动判定，不提供人工改判入口（FR-708）',
      body: '<div class="concl ' + (ev.pass ? 'pass' : 'fail') + '">' +
        '<span class="cc-ico">' + (ev.pass ? '✓' : '!') + '</span>' +
        '<div><h4>' + UI.tag(ev.conclusion, ev.pass ? 'ok' : 'danger', { dot: false }) +
        ' <span class="muted small">判定时间 ' + UI.esc(r.analyzedAt || '—') + '</span></h4>' +
        '<p>' + UI.esc(R.basisText(r, d, ev)) + '</p></div></div>' +
        (ev.reasons.length ? '<ul class="reason-list">' + ev.reasons.map(function (x) {
          return '<li><b>' + UI.esc(x.label) + '</b>：' + UI.esc(x.detail) + '</li>';
        }).join('') + '</ul>' : '') +
        '<div class="rule-note" style="margin-top:12px">判定式　|I − L| ≤ ' + ev.tol + '% × L（含端点）　·　' +
        '每只砝码各 3 次齐全　·　顺序 L1×3 → L2×3 → L3×3　·　9 次读数均为稳定读数' +
        (d.ranges === 2 ? '　·　识别到量程切换过程段' : '') + '</div>'
    });

    /* 识别明细 */
    var detailTable = UI.table({
      compact: true,
      cols: [
        { t: '编号', w: '74px', render: function (x) { return '<b class="num">' + x.key + '</b>'; } },
        { t: '量程', w: '72px', align: 'center', render: function (x) { return '<span class="small">' + x.rangeLabel + '</span>'; } },
        { t: '标称值 L', w: '88px', align: 'right', render: function (x) { return '<span class="num">' + x.L + 'g</span>'; } },
        { t: '限度 (1±' + ev.tol + '%)L', w: '186px', align: 'right', render: function (x) { return '<span class="num">' + R.fmt(x.lim.lo, x.dec) + 'g~' + R.fmt(x.lim.hi, x.dec) + 'g</span>'; } },
        {
          t: '测量示值 I', w: '118px', align: 'right', render: function (x) {
            if (x.missing) return '<span class="bad-mark">缺次</span>';
            return '<span class="num">' + R.fmt(x.value, x.dec) + 'g</span>';
          }
        },
        {
          t: '偏差', w: '96px', align: 'right', render: function (x) {
            return '<span class="num">' + (x.missing ? '—' : R.devStr(x.value, x.L, x.dec)) + '</span>';
          }
        },
        {
          t: '是否在限内', w: '104px', align: 'center', render: function (x) {
            if (x.missing) return UI.tag('缺次', 'warn');
            return UI.tag(x.inLimit ? '在限内' : '超限', x.inLimit ? 'ok' : 'danger');
          }
        },
        {
          t: '稳定性', w: '92px', align: 'center', render: function (x) {
            return x.stable === false ? UI.tag('不稳定', 'warn') : UI.tag('稳定', 'muted');
          }
        },
        {
          t: '置信度', w: '104px', align: 'right', render: function (x) {
            var low = R.isLowConf(x.conf);
            return '<span class="num' + (low ? ' bad-mark' : '') + '">' + (x.missing ? '—' : (Math.round(x.conf * 1000) / 10) + '%') + '</span>' +
              (low ? '<span class="cell-flag">低置信·需核对</span>' : '');
          }
        },
        { t: '识别截图', w: '104px', align: 'center', render: function () { return '<span class="small muted">已保存</span>'; } }
      ],
      rows: ev.items,
      rowClass: function (x) {
        if (x.missing) return 'row-danger';
        if (!x.inLimit || x.stable === false) return 'row-danger';
        if (R.isLowConf(x.conf)) return 'row-hl';
        return '';
      }
    });

    /* 修改痕迹 */
    var mods = r.modifications && r.modifications.length
      ? UI.table({
        compact: true,
        cols: [
          { t: '时间', w: '140px', render: function (m) { return '<span class="num small">' + UI.esc(m.at) + '</span>'; } },
          { t: '字段', w: '150px', render: function (m) { return UI.esc(m.field); } },
          { t: '修改前', w: '120px', render: function (m) { return '<span class="num small">' + UI.esc(m.before) + '</span>'; } },
          { t: '修改后', w: '150px', render: function (m) { return '<span class="num small">' + UI.esc(m.after) + '</span>'; } },
          { t: '操作人', w: '100px', render: function (m) { return UI.esc(Store.name(m.by)); } },
          { t: '理由', render: function (m) { return UI.esc(m.reason); } }
        ],
        rows: r.modifications
      })
      : '<div class="empty">本记录无字段修改痕迹</div>';

    /* 状态时间线 */
    function tl(cls, title, body) {
      return '<div class="tl-item ' + cls + '"><span class="tl-dot"></span>' +
        '<div class="tl-head"><b>' + title + '</b></div><div class="tl-body">' + body + '</div></div>';
    }
    var timeline = '<div class="timeline">' +
      tl(r.analyzedAt ? 'done' : 'cur', '系统自动分析完成，生成记录草稿',
        UI.esc(r.analyzedAt || '—') + ' · 识别 9 次读数 · 判定"' + ev.conclusion + '" · 关联任务 ' + UI.esc(r.taskId || '—')) +
      tl(r.submittedAt ? 'done' : (r.status === '待提交' ? 'cur' : ''), '检验人员一键提交（电子确认）',
        r.submittedAt ? UI.esc(Store.name(r.submittedBy)) + '（' + r.submittedBy + '） · ' + UI.esc(r.submittedAt) + ' · ' + UI.esc(r.submittedFrom) : '待提交') +
      tl(r.status === '已作废' ? 'stop' : r.verifiedAt ? 'done' : (r.status === '已提交' ? 'cur' : ''), '复核确认人员电子签名确认',
        r.status === '已作废' ? '记录已作废，未完成复核确认' :
          r.verifiedAt ? UI.esc(Store.name(r.verifiedBy)) + '（' + r.verifiedBy + '） · ' + UI.esc(r.verifiedAt) + ' · ' + UI.esc(r.verifiedFrom) : '待复核确认') +
      (r.status === '已作废' ? tl('stop', '管理员作废', UI.esc(Store.name(r.voidBy)) + ' · ' + UI.esc(r.voidAt) + ' · 理由：' + UI.esc(r.voidReason)) : '') +
      '</div>';

    var actions = '<a class="btn" href="#/print/' + r.id + '">打印预览 / 导出 PDF</a>' +
      '<a class="btn" href="#/export">批量导出</a>';
    if (r.status === '待提交' && Store.mine(r.inspector)) actions = '<a class="btn btn-pri" href="#/review/' + r.id + '">核对并提交</a>' + actions;
    if (Store.can('void') && r.status !== '已作废') actions += '<button class="btn btn-danger" data-act="void-record" data-arg="' + r.id + '">作废记录</button>';

    var body = banner +
      '<div class="grid grid-side" style="margin-bottom:16px">' + concl + info + '</div>' +
      UI.card({
        title: '原始视频（占位）与识别截图',
        sub: '点击进度条刻线或截图，可按 9 次读数时间点跳转（FR-810、FR-1009）',
        body: UI.player({ record: r, device: d, activeKey: active }) +
          '<div class="mt16">' + UI.shots(r, d, active) + '</div>'
      }) +
      UI.card({ title: '判定明细（9 次读数逐项）', sub: '限度按天平精度 d 对齐小数位（FR-204、FR-707）', flush: true, body: detailTable }) +
      '<div class="grid grid-2">' +
      UI.card({ title: '字段修改痕迹与留痕', sub: '修改前后值、时间、操作人、理由（FR-805、FR-806）', flush: true, body: mods }) +
      UI.card({ title: '状态流转与电子签名', body: timeline }) +
      '</div>' +
      UI.card({
        title: '电子签名',
        body: '<div class="grid grid-2">' +
          UI.sig(r.submittedBy ? {
            name: Store.name(r.submittedBy) + '（校验人员）', role: Store.roleLabel('inspector'),
            time: r.submittedAt, from: r.submittedFrom, locked: true, note: '一键提交即视为电子确认'
          } : null) +
          UI.sig(r.verifiedBy ? {
            name: Store.name(r.verifiedBy) + '（复核确认人）', role: Store.roleLabel('verifier'),
            time: r.verifiedAt, from: r.verifiedFrom, locked: true, note: '复核确认即电子签名'
          } : null) +
          '</div>'
      });

    return {
      html: UI.shell(UI.page({
        pageKey: 'recordDetail',
        title: '记录详情 <span class="muted small num">' + r.id + '</span>',
        sub: '视频为原始证据；记录、识别截图、读数时间、修改痕迹、审计日志与电子签名共同构成追溯链（QR-003）',
        actions: actions,
        body: body
      }), '/records/' + r.id),
      pageKey: 'recordDetail'
    };
  };

  /* ======================================================================
     5. 天平历史汇总与示值明细（FR-1003 ~ FR-1006，AC-016）
     ====================================================================== */
  Views.history = function (deviceId) {
    var sel = Store.state.filter.records;
    var d = Store.dev(deviceId) || Store.state.devices[0];
    var rows = Store.recordRows({ device: d.id, from: sel.histFrom || '', to: sel.histTo || '' });
    var concluded = rows.filter(function (r) { return r.status !== '已作废'; });
    var passN = concluded.filter(function (r) { return recordConclusion(r) === '通过'; }).length;
    var failN = concluded.length - passN;

    var devOpts = Store.state.devices.map(function (x) {
      return { v: x.id, t: x.id + ' · ' + x.uniqueNo + '（' + x.dept + '，' + (x.ranges === 2 ? '双量程' : '单量程') + '）' };
    });

    var listRows = rows.map(function (r) {
      var ev = R.evaluate(r, Store.dev(r.device));
      return {
        date: r.date, id: r.id, box: r.box, ins: Store.name(r.inspector),
        concl: r.status === '已作废' ? UI.tag('已作废', 'muted') : UI.tag(ev.conclusion, ev.pass ? 'ok' : 'danger'),
        status: UI.statusTag(r.status),
        abnormal: ev.reasons.length ? '<span class="small bad-mark">' + UI.esc(ev.reasons.map(function (x) { return x.label; }).join('、')) + '</span>' : '<span class="small muted">—</span>',
        act: '<a class="btn-link" href="#/records/' + r.id + '">详情</a>'
      };
    });

    var detailCols = [
      { t: '校验日期', w: '104px', render: function (r) { return '<span class="num">' + r.date + '</span>'; } },
      { t: '结论', w: '78px', align: 'center', render: function (r) {
        var ev = R.evaluate(r, Store.dev(r.device));
        return r.status === '已作废' ? UI.tag('已作废', 'muted') : UI.tag(ev.conclusion, ev.pass ? 'ok' : 'danger');
      } }
    ];
    var keys = ['I1-1', 'I1-2', 'I1-3', 'I2-1', 'I2-2', 'I2-3', 'I3-1', 'I3-2', 'I3-3'];
    keys.forEach(function (k) {
      detailCols.push({
        t: k, w: '104px', align: 'right',
        render: function (r) {
          var ev = R.evaluate(r, Store.dev(r.device));
          var it = ev.items.filter(function (x) { return x.key === k; })[0];
          if (!it) return '—';
          if (it.missing) return '<span class="bad-mark">缺次</span>';
          var bad = !it.inLimit || it.stable === false;
          return '<span class="num' + (bad ? ' bad-mark' : '') + '">' + R.fmt(it.value, it.dec) + '</span>';
        }
      });
    });
    detailCols.push({ t: '砝码盒', w: '106px', render: function (r) { return '<span class="num small">' + UI.esc(r.box) + '</span>'; } });
    detailCols.push({ t: '检验人员', w: '92px', render: function (r) { return UI.esc(Store.name(r.inspector)); } });
    detailCols.push({ t: '复核状态', w: '104px', align: 'center', render: function (r) { return UI.statusTag(r.status); } });

    var body =
      UI.card({
        title: '筛选条件',
        body: '<div class="inline-fields">' +
          UI.field({
            label: '天平编号', control: UI.select('hdev', d.id, devOpts, {
              cls: 'sm', attrs: ' data-change="hist-device"'
            })
          }) +
          UI.field({ label: '日期起', control: UI.input('hfrom', sel.histFrom || '', { type: 'date', cls: 'sm', attrs: ' data-change="hist-from"' }) }) +
          UI.field({ label: '日期止', control: UI.input('hto', sel.histTo || '', { type: 'date', cls: 'sm', attrs: ' data-change="hist-to"' }) }) +
          '<button class="btn btn-sm" data-act="hist-reset">重置</button>' +
          '<button class="btn btn-sm" data-act="export-detail">导出示值明细汇总表（Excel/CSV）</button>' +
          '</div>'
      }) +
      '<div class="grid grid-4" style="margin-bottom:16px">' +
      '<div class="stat"><div class="stat-label">该天平记录数</div><div class="stat-value">' + rows.length + '</div><div class="stat-hint">不含未生成记录的异常任务</div></div>' +
      '<div class="stat ok"><div class="stat-label">判定通过</div><div class="stat-value">' + passN + '</div><div class="stat-hint">含边界值在限内</div></div>' +
      '<div class="stat danger"><div class="stat-label">判定不通过</div><div class="stat-value">' + failN + '</div><div class="stat-hint">超限 / 缺次 / 不稳定 / 缺量程切换</div></div>' +
      '<div class="stat"><div class="stat-label">最近一次校验</div><div class="stat-value" style="font-size:17px">' + (rows[0] ? rows[0].date : '—') + '</div><div class="stat-hint">' + (rows[0] ? '结论 ' + recordConclusion(rows[0]) : '') + '</div></div>' +
      '</div>' +
      UI.card({
        title: '历史记录汇总视图', sub: '按校验日期倒序，可下钻到记录详情（FR-1003、FR-1005）', flush: true,
        body: UI.table({
          compact: true,
          cols: [
            { t: '校验日期', w: '104px', render: function (r) { return '<span class="num">' + r.date + '</span>'; } },
            { t: '记录编号', w: '158px', render: function (r) { return '<a class="num" href="#/records/' + r.id + '">' + r.id + '</a>'; } },
            { t: '砝码盒编号', w: '116px', render: function (r) { return '<span class="num">' + UI.esc(r.box) + '</span>'; } },
            { t: '检验人员', w: '96px', render: function (r) { return UI.esc(r.ins); } },
            { t: '判定结论', w: '96px', align: 'center', render: function (r) { return r.concl; } },
            { t: '复核状态', w: '110px', align: 'center', render: function (r) { return r.status; } },
            { t: '异常标注', w: '220px', render: function (r) { return r.abnormal; } },
            { t: '操作', render: function (r) { return r.act; } }
          ],
          rows: listRows,
          empty: '该天平暂无记录',
          rowClass: function (r) { return r.concl.indexOf('不通过') >= 0 ? 'row-danger' : ''; }
        })
      }) +
      UI.card({
        title: '示值明细汇总表', sub: '按标称点 L1 / L2 / L3 列出历次校验的 9 个读数与是否在限内，便于人工比对（FR-1004）',
        actions: '<span class="small muted">按需求 FR-1004，本系统不提供图形化示值曲线</span>',
        flush: true,
        body: UI.table({
          compact: true, cols: detailCols, rows: rows,
          empty: '暂无数据',
          rowClass: function (r) {
            var ev = R.evaluate(r, Store.dev(r.device));
            return ev.items.some(function (x) { return !x.inLimit || x.missing || x.stable === false; }) ? 'row-hl' : '';
          }
        })
      }) +
      UI.alert('flat', '为什么没有曲线图？',
        '需求说明书 FR-1004 明确：本系统宜提供示值明细汇总表，便于人工比对，<b>不提供图形化示值曲线</b>。' +
        '原需求文档中曾提到"可形成曲线图"，已由需求规格说明书修正为汇总表形式，请客户在本页确认该口径。');

    return {
      html: UI.shell(UI.page({
        pageKey: 'history',
        title: '天平历史汇总 <span class="muted small">' + d.id + ' · ' + UI.esc(d.uniqueNo) + '</span>',
        sub: '按天平编号查看历史记录汇总与示值明细，支持按日期段、判定结论筛选并标注异常记录',
        actions: '<a class="btn" href="#/records">返回记录查询</a>' +
          '<a class="btn" href="#/print/' + (rows[0] ? rows[0].id : '') + '">打印最近一次记录</a>',
        body: body
      }), '/history/' + d.id),
      pageKey: 'history'
    };
  };

})();
