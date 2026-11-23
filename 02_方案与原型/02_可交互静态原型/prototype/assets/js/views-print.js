/* ==========================================================================
   views-print.js — 打印版式：单日记录表（对齐客户 Excel）、周统计表、空白表与卡片清单
   版式逐行复刻客户《电子天平日常校验记录表.xlsx》：
   科室 / 天平唯一号 / Max / d / 内部校正方式 / 校验日期 / 清洁 / 水平调节 / 内部校正是否通过 / 备注
   / 砝码唯一号 / L1~L3 标称值与限度 / 9 次示值与测量时间 / 外部校正是否通过 / 备注 / 双签名 / 注释行
   ========================================================================== */
(function () {
  'use strict';

  var APP = window.APP, Store = window.Store, UI = window.UI, R = APP.Rules, T = APP.time;
  var Views = window.Views = window.Views || {};

  function chk(cond, label) { return (cond ? '☑' : '□') + label; }
  function dash(v) { return (v === null || v === undefined || v === '') ? '' : v; }

  /** 生成一张 A4 单日记录表（供打印预览与模板配置预览复用） */
  Views.printSheet = function (r, d, opt) {
    opt = opt || {};
    var tpl = Store.state.template;
    var ev = R.evaluate(r, d);
    var tol = ev.tol;
    var label = {};
    tpl.fields.forEach(function (f) { label[f.key] = f; });
    var show = function (k) { return !label[k] || label[k].show; };
    var nameOf = function (k, def) { return (label[k] && label[k].label) || def; };

    function row(lb, val, cls, id) {
      return '<tr' + (id ? ' id="' + id + '"' : '') + '><td class="lb">' + lb + '</td><td class="val ' + (cls || '') + '">' + dash(val) + '</td></tr>';
    }
    function noteRow(text, cls) {
      return '<tr><td class="note" colspan="2">' + text + '</td></tr>';
    }

    var rows = '';
    if (show('dept')) rows += row('科 室', UI.esc(d.dept));
    if (show('uniqueNo')) rows += row('天平唯一号', UI.esc(d.uniqueNo));
    if (show('max')) rows += row('Max(g)', d.range1.max);
    if (show('d')) rows += row('d(mg)', d.range1.d);
    if (show('internalCalType')) {
      rows += row('内部校正方式：', chk(d.internalCal === '自动触发', '自动触发') + '　' +
        chk(d.internalCal === '手动触发', '手动触发') + '　' + chk(d.internalCal === 'NA', 'NA'));
    }
    if (show('date')) rows += row('校验日期', r.date);
    if (show('cleanliness')) rows += row('清 洁', chk(r.cleanliness === '是', '是') + '　' + chk(r.cleanliness === '否', '否') + '　' + chk(r.cleanliness === 'NA', 'NA'));
    if (show('level')) rows += row('水平调节', chk(r.level === '是', '是') + '　' + chk(r.level === '否', '否') + '　' + chk(r.level === 'NA', 'NA'));
    if (show('internalCal')) rows += row('内部校正是否通过', chk(r.internalCal === '是', '是') + '　' + chk(r.internalCal === '否', '否') + '　' + chk(r.internalCal === 'NA', 'NA'));
    if (show('remark')) rows += row('备注', UI.esc(r.remark === '无' ? '' : r.remark));
    if (show('box')) rows += row(nameOf('box', '砝码唯一号'), '<span class="num">' + UI.esc(r.box) + '</span>');

    [0, 1, 2].forEach(function (p) {
      var L = d.points[p];
      var range = d.ranges === 2 ? (d.pointRange[p] || (p === 0 ? 1 : 2)) : 1;
      var dec = R.decimalsOf(d, range);
      rows += row('砝码标称质量值(L' + (p + 1) + ')', L + 'g');
      rows += row('限度(1±' + tol + '%)L' + (p + 1), R.fmt(L * (1 - tol / 100), dec) + 'g~' + R.fmt(L * (1 + tol / 100), dec) + 'g');
      for (var i = 0; i < 3; i++) {
        var it = ev.items.filter(function (x) { return x.point === p && x.idx === (i + 1); })[0];
        rows += row('测量示值(I' + (p + 1) + '-' + (i + 1) + ')',
          it && !it.missing ? '<span class="num">' + R.fmt(it.value, dec) + 'g</span>' : (it && it.missing ? '未识别（缺次）' : ''));
        if (tpl.printTime && show('time')) {
          rows += row('测量时间(I' + (p + 1) + '-' + (i + 1) + ')',
            it && !it.missing ? '<span class="num">' + T.timeAt(r.startTime, it.ro.off) + '</span>' : '');
        }
      }
    });

    rows += row('外部校正是否通过',
      chk(ev.pass, '是') + '　' + chk(!ev.pass, '否') + '　<b>' + ev.conclusion + '</b>');
    rows += row('备注', UI.esc(r.remark === '无' ? '' : r.remark));
    rows += row('校验人员签名',
      (r.submittedBy ? '<span class="num">' + UI.esc(Store.name(r.submittedBy)) + '（' + r.submittedBy + '） ' + UI.esc(r.submittedAt || '') + '</span>' : ''));
    rows += row('复核确认人签名',
      (r.verifiedBy ? '<span class="num">' + UI.esc(Store.name(r.verifiedBy)) + '（' + r.verifiedBy + '） ' + UI.esc(r.verifiedAt || '') + '</span>' : ''));

    /* 判定结论明细：全部在限内时按标称点归并，存在异常时逐项列出 */
    var detailParts = [];
    [0, 1, 2].forEach(function (p) {
      var items = ev.items.filter(function (x) { return x.point === p; });
      var bad = items.filter(function (x) { return !x.inLimit || x.stable === false || x.missing; });
      if (!bad.length) {
        detailParts.push('L' + (p + 1) + '（' + d.points[p] + 'g）3 次均在限内');
      } else {
        bad.forEach(function (it) {
          detailParts.push('L' + (p + 1) + ' 第 ' + it.idx + ' 次 ' +
            (it.missing ? '<b>缺次</b>'
              : it.stable === false ? '<b>读数不稳定</b>'
                : '<b>超限</b> ' + R.fmt(it.value, it.dec) + 'g（偏差 ' + R.devStr(it.value, it.L, it.dec) + 'g）'));
        });
      }
    });
    var detailLine = (ev.pass ? '' : '') + detailParts.join('；');

    if (show('detail')) rows += noteRow('<b>判定结论明细：</b>' + detailLine);
    rows += noteRow(UI.esc(tpl.footerNote));

    var wm = '';
    if (r.status === '已作废') wm = '<div class="watermark">已作废</div>';
    else if (r.status !== '已复核确认') wm = '<div class="watermark gray">未复核</div>';

    var meta = '<div class="a4-meta"><span>记录编号：<b>' + r.id + '</b></span>' +
      '<span>判定结论：<b>' + ev.conclusion + '</b></span>' +
      '<span>导出时间：' + Store.now() + '</span></div>';

    var sheet = '<div class="a4">' + wm +
      '<div class="a4-title">电子天平日常校验记录表</div>' + meta +
      '<table class="form-tbl"><tbody>' + rows + '</tbody></table>' +
      '<div class="a4-foot">' +
      '判定依据：' + UI.esc(R.basisText(r, d, ev)) + '（容差系数 ' + tol + '%）' +
      '<br>原始视频 ' + UI.esc(r.file) + '（' + r.fileSize + 'MB，SHA-256 ' + UI.esc(r.sha) + '…）' +
      '　·　模板版本 ' + tpl.version + '　·　时区 ' + APP.env.timezone +
      '</div></div>';
    return sheet;
  };

  /* ======================================================================
     单日记录表打印预览（FR-1101、FR-1102、FR-1106、FR-1110、CR-015）
     ====================================================================== */
  Views.printRecord = function (id) {
    var r = Store.rec(id) || Store.state.records[0];
    var d = Store.dev(r.device);
    var ev = R.evaluate(r, d);

    var toolbar = '<div class="a4-toolbar no-print">' +
      '<div><b>打印预览：单日记录表</b>' +
      '<div class="small muted">A4 纵向 · 页边距与字号满足留档要求 · 中文字体本地嵌入（CR-005、FR-1106）；' +
      '打印页面不包含导航与按钮等界面元素（FR-1110）</div></div>' +
      '<div class="btn-group">' +
      '<a class="btn btn-sm" href="#/records/' + r.id + '">返回记录详情</a>' +
      '<a class="btn btn-sm" href="#/export">批量导出</a>' +
      '<button class="btn btn-sm btn-pri" data-act="print">打印 / 另存为 PDF</button>' +
      '</div></div>';

    var info = '<div class="grid grid-3 no-print" style="margin-bottom:14px">' +
      '<div class="stat"><div class="stat-label">记录状态</div><div class="stat-value" style="font-size:17px">' +
      UI.statusTag(r.status) + '</div><div class="stat-hint">' +
      (r.status === '已复核确认' ? '可导出为正式 PDF' : r.status === '已作废' ? '已作废：单条导出带"已作废"水印，不参与统计与批量导出' : '未复核：导出时须标注"未复核"水印，防止误用作正式记录（FR-1103）') +
      '</div></div>' +
      '<div class="stat"><div class="stat-label">判定结论</div><div class="stat-value" style="font-size:17px">' +
      UI.tag(ev.conclusion, ev.pass ? 'ok' : 'danger') + '</div><div class="stat-hint">判定由系统自动完成，不提供人工改判入口（FR-708）</div></div>' +
      '<div class="stat"><div class="stat-label">版式一致性</div><div class="stat-value" style="font-size:17px">已对齐</div>' +
      '<div class="stat-hint">字段顺序与客户《电子天平日常校验记录表》一致（CR-015）</div></div>' +
      '</div>';

    return {
      html: UI.shell(UI.page({
        pageKey: 'printRecord',
        title: '单日记录表打印预览',
        sub: '记录编号 ' + r.id + ' · 天平 ' + d.id + ' · ' + UI.esc(d.uniqueNo),
        body: toolbar + info + '<div class="a4-wrap">' + Views.printSheet(r, d) + '</div>'
      }), '/print/' + r.id),
      pageKey: 'printRecord'
    };
  };

  /* ======================================================================
     周统计表打印预览（FR-1105、附录 A.2、AC-015）
     ====================================================================== */
  function mondayOf(dateStr) {
    var d = T.parseMin(dateStr + ' 00:00');
    var wd = (d.getDay() + 6) % 7; // 0 = 周一
    d.setDate(d.getDate() - wd);
    return T.fmtDate(d);
  }
  function weekDates(monday) {
    var out = [], d = T.parseMin(monday + ' 00:00');
    for (var i = 0; i < 7; i++) {
      out.push(T.fmtDate(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  Views.printWeek = function () {
    var f = Store.state.filter.week = Store.state.filter.week || { dev: 'F002', monday: '2026-09-21' };
    var d = Store.dev(f.dev) || Store.state.devices[0];
    var days = weekDates(f.monday);
    var weekRecords = Store.state.records.filter(function (r) {
      return r.device === d.id && days.indexOf(r.date) >= 0 && r.status === '已复核确认';
    });
    var cols = days.filter(function (dt) {
      return weekRecords.some(function (r) { return r.date === dt; });
    });
    if (!cols.length) cols = [days[0]];
    var get = function (dt) {
      return weekRecords.filter(function (r) { return r.date === dt; })[0] || null;
    };
    function evOf(r) { return r ? R.evaluate(r, d) : null; }
    function decOf(p) { return R.decimalsOf(d, d.ranges === 2 ? (d.pointRange[p] || (p === 0 ? 1 : 2)) : 1); }

    function row(lb, fn, cls) {
      return '<tr><td class="lb">' + lb + '</td>' +
        cols.map(function (dt) {
          var r = get(dt), v = fn(r, dt);
          return '<td class="val ' + (cls || '') + '">' + (v === null || v === undefined ? '' : v) + '</td>';
        }).join('') + '</tr>';
    }
    var span = cols.length + 1;
    var rows =
      '<tr><td class="lb">科 室</td><td class="val" colspan="' + cols.length + '">' + UI.esc(d.dept) + '</td></tr>' +
      row('天平唯一号', function () { return UI.esc(d.uniqueNo); }) +
      row('Max(g)', function () { return d.range1.max; }) +
      row('d(mg)', function () { return d.range1.d; }) +
      row('内部校正方式：', function () {
        return chk(d.internalCal === '自动触发', '自动触发') + ' ' + chk(d.internalCal === '手动触发', '手动触发') + ' ' + chk(d.internalCal === 'NA', 'NA');
      }) +
      row('校验日期', function (r, dt) { return r ? dt : '<span style="color:#999">' + dt + '（无记录）</span>'; }) +
      row('清 洁', function (r) { return r ? r.cleanliness : ''; }) +
      row('水平调节', function (r) { return r ? r.level : ''; }) +
      row('内部校正是否通过', function (r) { return r ? r.internalCal : ''; }) +
      row('备注', function (r) { return r && r.remark !== '无' ? UI.esc(r.remark) : ''; }) +
      row('砝码唯一号', function (r) { return r ? '<span class="num">' + UI.esc(r.box) + '</span>' : ''; });

    [0, 1, 2].forEach(function (p) {
      var L = d.points[p], dec = decOf(p);
      rows += row('砝码标称质量值(L' + (p + 1) + ')', function () { return L + 'g'; });
      rows += row('限度(1±' + APP.TOL_DEFAULT + '%)L' + (p + 1), function () {
        return R.fmt(L * (1 - APP.TOL_DEFAULT / 100), dec) + 'g~' + R.fmt(L * (1 + APP.TOL_DEFAULT / 100), dec) + 'g';
      });
      for (var i = 0; i < 3; i++) {
        (function (p, i) {
          rows += row('测量示值(I' + (p + 1) + '-' + (i + 1) + ')', function (r) {
            var ev = evOf(r);
            if (!ev) return '';
            var it = ev.items.filter(function (x) { return x.point === p && x.idx === (i + 1); })[0];
            if (!it) return '';
            if (it.missing) return '未识别';
            return '<span class="num">' + R.fmt(it.value, dec) + 'g</span>';
          });
          rows += row('测量时间(I' + (p + 1) + '-' + (i + 1) + ')', function (r) {
            var ev = evOf(r);
            if (!ev) return '';
            var it = ev.items.filter(function (x) { return x.point === p && x.idx === (i + 1); })[0];
            return it && !it.missing ? '<span class="num">' + T.timeAt(r.startTime, it.ro.off) + '</span>' : '';
          });
        })(p, i);
      }
    });

    rows += row('外部校正是否通过', function (r) {
      var ev = evOf(r);
      return ev ? (chk(ev.pass, '是') + ' ' + chk(!ev.pass, '否')) : '';
    });
    rows += row('备注', function (r) { return r && r.remark !== '无' ? UI.esc(r.remark) : ''; });
    rows += row('校验人员签名', function (r) {
      return r && r.submittedBy ? '<span class="num">' + UI.esc(Store.name(r.submittedBy)) + '</span>' : '';
    });
    rows += row('复核确认人签名', function (r) {
      return r && r.verifiedBy ? '<span class="num">' + UI.esc(Store.name(r.verifiedBy)) + '</span>' : '';
    });
    rows += '<tr><td class="note" colspan="' + span + '">' + UI.esc(Store.state.template.footerNote) +
      '　（统计口径：逐日取该日"已复核确认"记录的对应取值；无记录日期留空；作废记录不参与统计。）</td></tr>';

    var sheet = '<div class="a4">' +
      '<div class="a4-title">电子天平每周校验统计记录表</div>' +
      '<div class="a4-meta"><span>天平编号：<b>' + d.id + '</b></span>' +
      '<span>统计周期：' + f.monday + ' ~ ' + days[6] + '（周一至周日）</span>' +
      '<span>导出时间：' + Store.now() + '</span></div>' +
      '<table class="form-tbl"><tbody>' + rows + '</tbody></table>' +
      '<div class="a4-foot">按实际存在记录的日期成列，最多 7 列（本周 ' + cols.length + ' 列）；' +
      '版式与客户现行《每周天平校验统计记录表》一致，便于打印后比对留档（FR-1105、附录 A.2）。' +
      '<br>说明：客户原始 Excel 中该工作表沿用"电子天平日常校验记录表"标题，原型按实际含义显示为"电子天平每周校验统计记录表"，请客户确认。</div>' +
      '</div>';

    var toolbar = '<div class="a4-toolbar no-print">' +
      '<div><b>打印预览：周统计表</b>' +
      '<div class="small muted">同一台天平同一自然周的记录并列展示，按实际有记录日期成列（最多 7 列）</div></div>' +
      '<div class="btn-group">' +
      '<a class="btn btn-sm" href="#/history/' + d.id + '">查看该天平历史汇总</a>' +
      '<a class="btn btn-sm" href="#/export">批量导出</a>' +
      '<button class="btn btn-sm btn-pri" data-act="print">打印 / 另存为 PDF</button>' +
      '</div></div>';

    var picker = '<div class="card no-print"><div class="card-body"><div class="inline-fields">' +
      UI.field({
        label: '天平编号', control: UI.select('wdev', d.id, Store.state.devices.map(function (x) {
          return { v: x.id, t: x.id + ' · ' + x.uniqueNo };
        }), { cls: 'sm', attrs: ' data-change="week-dev"' })
      }) +
      UI.field({ label: '所在周的任意日期（自动对齐到周一）', control: UI.input('wmon', f.monday, { type: 'date', cls: 'sm', attrs: ' data-change="week-mon"' }) }) +
      '<span class="small muted">本周已复核确认记录 ' + weekRecords.length + ' 条；作废记录不参与统计。</span>' +
      '</div></div></div>';

    return {
      html: UI.shell(UI.page({
        pageKey: 'printWeek',
        title: '周统计表打印预览',
        sub: '天平 ' + d.id + ' · ' + f.monday + ' ~ ' + days[6],
        body: toolbar + picker + '<div class="a4-wrap">' + sheet + '</div>'
      }), '/print/week'),
      pageKey: 'printWeek'
    };
  };

  /* ======================================================================
     空白记录表与卡片清单（FR-108、附录 A.1、附录 B）
     ====================================================================== */
  function qrPattern(code) {
    var h = 0;
    for (var i = 0; i < String(code).length; i++) h = (h * 31 + String(code).charCodeAt(i)) % 9973;
    var cells = '';
    for (var y = 0; y < 7; y++) {
      for (var x = 0; x < 7; x++) {
        var finder = (x < 3 && y < 3) || (x > 3 && y < 3) || (x < 3 && y > 3);
        var on = finder ? !((x === 1 && y === 1) || (x === 5 && y === 1) || (x === 1 && y === 5)) : (((h >> (x + y * 7)) & 1) === 1);
        cells += '<i class="' + (on ? '' : 'blank') + '"></i>';
      }
    }
    return '<div class="qr-ph">' + cells + '</div>';
  }

  Views.printBlank = function () {
    var d = Store.dev('F001');
    var blank = {
      id: '（空白）', date: '', device: d.id, inspector: '', box: '', startTime: '',
      duration: 0, file: '', fileSize: '', sha: '', status: '待提交', cleanliness: '', level: '',
      internalCal: '', remark: '', rangeSwitch: true,
      personCard: { account: '', conf: 1 }, deviceCard: { code: d.id, conf: 1 },
      speech: {}, modifications: [], readouts: [], submittedBy: null, verifiedBy: null
    };

    var blankSheet = '<div class="a4"><div class="a4-title">电子天平日常校验记录表（空白打印版）</div>' +
      '<div class="a4-meta"><span>用途：手工填写备用（FR-108）</span><span>版式与系统电子记录一致</span>' +
      '<span>导出时间：' + Store.now() + '</span></div>' +
      '<table class="form-tbl"><tbody>' +
      '<tr><td class="lb">科 室</td><td class="val"></td></tr>' +
      '<tr><td class="lb">天平唯一号</td><td class="val"></td></tr>' +
      '<tr><td class="lb">Max(g)</td><td class="val"></td></tr>' +
      '<tr><td class="lb">d(mg)</td><td class="val"></td></tr>' +
      '<tr><td class="lb">内部校正方式：</td><td class="val">□自动触发　□手动触发　□NA</td></tr>' +
      '<tr><td class="lb">校验日期</td><td class="val"></td></tr>' +
      '<tr><td class="lb">清 洁</td><td class="val">□是　□否　□NA</td></tr>' +
      '<tr><td class="lb">水平调节</td><td class="val">□是　□否　□NA</td></tr>' +
      '<tr><td class="lb">内部校正是否通过</td><td class="val">□是　□否　□NA</td></tr>' +
      '<tr><td class="lb">备注</td><td class="val"></td></tr>' +
      '<tr><td class="lb">砝码唯一号</td><td class="val"></td></tr>' +
      [0, 1, 2].map(function (p) {
        return '<tr><td class="lb">砝码标称质量值(L' + (p + 1) + ')</td><td class="val"></td></tr>' +
          '<tr><td class="lb">限度(1±0.05%)L' + (p + 1) + '</td><td class="val"></td></tr>' +
          [1, 2, 3].map(function (i) {
            return '<tr><td class="lb">测量示值(I' + (p + 1) + '-' + i + ')</td><td class="val"></td></tr>' +
              '<tr><td class="lb">测量时间(I' + (p + 1) + '-' + i + ')</td><td class="val"></td></tr>';
          }).join('');
      }).join('') +
      '<tr><td class="lb">外部校正是否通过</td><td class="val">□是　□否</td></tr>' +
      '<tr><td class="lb">备注</td><td class="val"></td></tr>' +
      '<tr><td class="lb">校验人员签名</td><td class="val"></td></tr>' +
      '<tr><td class="lb">复核确认人签名</td><td class="val"></td></tr>' +
      '<tr><td class="note" colspan="2">' + UI.esc(Store.state.template.footerNote) + '</td></tr>' +
      '</tbody></table>' +
      '</div>';

    var personCards = Store.state.accounts.filter(function (a) { return a.role !== 'admin'; }).map(function (a) {
      return '<div class="id-card">' + qrPattern(a.id) +
        '<div class="ic-title">人 员 卡</div>' +
        '<div class="ic-code">' + a.id + '</div>' +
        '<div class="ic-sub">' + UI.esc(a.name) + ' · ' + Store.roleLabel(a.role) + '</div>' +
        '<div class="ic-sub">二维码内容 = 账号编号，与系统账号一一对应（FR-107）</div></div>';
    }).join('');

    var deviceCards = Store.state.devices.map(function (x) {
      return '<div class="id-card">' + qrPattern(x.qrValue) +
        '<div class="ic-title">设 备 卡</div>' +
        '<div class="ic-code">' + UI.esc(x.qrValue) + '</div>' +
        '<div class="ic-sub">' + x.id + ' · ' + UI.esc(x.uniqueNo) + ' · ' + UI.esc(x.dept) + '</div>' +
        '<div class="ic-sub">二维码内容：' + UI.esc(x.qrContent) + '（FR-210）</div></div>';
    }).join('');

    var cardSheet = '<div class="a4"><div class="a4-title">人员卡 / 设备卡内容清单</div>' +
      '<div class="a4-meta"><span>导出时间：' + Store.now() + '</span>' +
      '<span>制作要求：尺寸 ≥40mm×40mm，纠错等级 H，设备卡固定于天平正面或侧面且不遮挡显示屏</span></div>' +
      '<div class="card-sheet">' + personCards + deviceCards + '</div>' +
      '<div class="a4-foot">卡片由客户自行打印；人员卡由检验人员随身携带并在拍摄开始时正对镜头展示，' +
      '设备卡固定张贴在对应天平上。卡片内容不包含姓名、身份证号等敏感信息（附录 B.2）。' +
      '<br>注意：本页二维码为原型占位图形，真实系统将按上述内容生成可用二维码。</div></div>';

    var toolbar = '<div class="a4-toolbar no-print">' +
      '<div><b>空白记录表与卡片清单</b>' +
      '<div class="small muted">供客户自行打印：空白记录表用于应急手工记录；人员卡与设备卡用于视频中的二维码识别</div></div>' +
      '<div class="btn-group">' +
      '<button class="btn btn-sm" data-act="toast-export">导出空白表 PDF</button>' +
      '<button class="btn btn-sm" data-act="toast-export">导出卡片清单 PDF</button>' +
      '<button class="btn btn-sm btn-pri" data-act="print">打印 / 另存为 PDF</button>' +
      '</div></div>';

    var body = UI.alert('info', '两类打印件的用途',
      '① <b>空白记录表</b>：与现有纸质记录表版式一致，供系统不可用时手工填写；' +
      '② <b>人员卡 / 设备卡清单</b>：列出卡片内容（人员卡 = 账号编号，设备卡 = 天平编号或天平唯一号）与二维码，供客户自行打印塑封。' +
      '人员卡/设备卡内容清单导出为可选需求（FR-108），请客户确认是否需要首版实现。') +
      toolbar + '<div class="a4-wrap" style="flex-direction:column;align-items:center;gap:18px">' + blankSheet + cardSheet + '</div>';

    return {
      html: UI.shell(UI.page({
        pageKey: 'printBlank',
        title: '空白记录表与卡片清单',
        sub: '空白单日记录表 + 人员卡 / 设备卡内容清单（含二维码占位）',
        body: body
      }), '/print/blank'),
      pageKey: 'printBlank'
    };
  };

})();
