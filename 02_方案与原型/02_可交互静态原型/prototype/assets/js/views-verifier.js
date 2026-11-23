/* ==========================================================================
   views-verifier.js — 待复核、复核详情、主数据管理、记录模板配置、导出与打印
   ========================================================================== */
(function () {
  'use strict';

  var APP = window.APP, Store = window.Store, UI = window.UI, R = APP.Rules, T = APP.time;
  var Views = window.Views = window.Views || {};

  /* ======================================================================
     待复核工作台（FR-901、FR-908）
     ====================================================================== */
  Views.verify = function () {
    var f = Store.state.filter.verify = Store.state.filter.verify || { device: '', inspector: '', from: '', to: '' };
    var pending = Store.pendingVerify();
    var rows = pending.filter(function (r) {
      if (f.device && r.device !== f.device) return false;
      if (f.inspector && r.inspector !== f.inspector) return false;
      if (f.from && (r.submittedAt || '').slice(0, 10) < f.from) return false;
      if (f.to && (r.submittedAt || '').slice(0, 10) > f.to) return false;
      return true;
    });
    var verifiedToday = Store.state.records.filter(function (r) {
      return r.verifiedBy && (r.verifiedAt || '').slice(0, 10) === '2026-09-28';
    }).length;
    var devOpts = Store.state.devices.map(function (d) { return { v: d.id, t: d.id + ' · ' + d.uniqueNo }; });
    var insOpts = Store.state.accounts.filter(function (a) { return a.role === 'inspector'; })
      .map(function (a) { return { v: a.id, t: a.name + '（' + a.id + '）' }; });

    function row(r) {
      var d = Store.dev(r.device);
      var ev = R.evaluate(r, d);
      var low = R.lowConfItems(r, d).length;
      var mods = (r.modifications || []).length;
      return {
        id: '<a class="num" href="#/verify/' + r.id + '">' + r.id + '</a>',
        dev: '<a href="#/history/' + r.device + '">' + r.device + '</a><div class="small muted">' + UI.esc(d.uniqueNo) + '</div>',
        ins: UI.esc(Store.name(r.inspector)),
        concl: UI.tag(ev.conclusion, ev.pass ? 'ok' : 'danger'),
        sub: '<span class="num small">' + UI.esc(r.submittedAt) + '</span>',
        flags: (low ? UI.tag(low + ' 项低置信', 'warn') : '') +
          (mods ? UI.tag(mods + ' 处修改', 'info') : '') +
          (ev.reasons.length ? UI.tag(ev.reasons.length + ' 项不通过原因', 'danger') : UI.tag('无异常', 'muted')),
        act: '<a class="btn btn-sm btn-pri" href="#/verify/' + r.id + '">复核</a>' +
          ' <a class="btn btn-sm" href="#/records/' + r.id + '">详情</a>'
      };
    }

    var body =
      UI.alert('info', '复核确认人员操作不超过两步',
        '① 查看记录（视频、识别截图、判定依据、字段修改痕迹与低置信标记）　② 确认（电子签名）或退回并填写理由（QR-004、FR-902、FR-903）。' +
        '复核确认人员不得直接修改识别结果与判定结论，只能退回由检验人员修改（FR-906）。') +
      '<div class="grid grid-4" style="margin-bottom:16px">' +
      '<div class="stat warn"><div class="stat-label">待复核记录</div><div class="stat-value">' + pending.length + '</div><div class="stat-hint">已提交但未确认</div></div>' +
      '<div class="stat ok"><div class="stat-label">今日已复核确认</div><div class="stat-value">' + verifiedToday + '</div><div class="stat-hint">2026-09-28</div></div>' +
      '<div class="stat"><div class="stat-label">平均复核时长</div><div class="stat-value">8<span style="font-size:13px"> 分钟</span></div><div class="stat-hint">从提交到确认</div></div>' +
      '<div class="stat danger"><div class="stat-label">待复核中含不通过记录</div><div class="stat-value">' +
      pending.filter(function (r) { return !R.evaluate(r, Store.dev(r.device)).pass; }).length + '</div>' +
      '<div class="stat-hint">不通过记录同样需提交与复核归档（FR-711）</div></div>' +
      '</div>' +
      UI.card({
        title: '待复核记录', sub: '支持按提交时间、天平编号、检验人员筛选（FR-901）', flush: true,
        actions: '<span class="small muted">确认后记录锁定，所有字段不可修改（FR-808）</span>',
        body: '<div class="tbl-tools">' +
          '<div class="field" style="margin:0"><div class="field-label">天平编号</div>' +
          UI.select('vdevice', f.device, devOpts, { placeholder: '全部', cls: 'sm', attrs: ' data-change="verify-device"' }) + '</div>' +
          '<div class="field" style="margin:0"><div class="field-label">检验人员</div>' +
          UI.select('vinspector', f.inspector, insOpts, { placeholder: '全部', cls: 'sm', attrs: ' data-change="verify-inspector"' }) + '</div>' +
          '<div class="field" style="margin:0"><div class="field-label">提交日期起</div>' +
          UI.input('vfrom', f.from, { type: 'date', cls: 'sm', attrs: ' data-change="verify-from"' }) + '</div>' +
          '<div class="field" style="margin:0"><div class="field-label">提交日期止</div>' +
          UI.input('vto', f.to, { type: 'date', cls: 'sm', attrs: ' data-change="verify-to"' }) + '</div>' +
          '<button class="btn btn-sm" data-act="verify-reset">重置</button>' +
          '</div>' +
          UI.table({
            cols: [
              { t: '记录编号', w: '160px', render: function (r) { return r.id; } },
              { t: '天平', w: '170px', render: function (r) { return r.dev; } },
              { t: '检验人员', w: '96px', render: function (r) { return r.ins; } },
              { t: '判定结论', w: '96px', align: 'center', render: function (r) { return r.concl; } },
              { t: '提交时间', w: '150px', render: function (r) { return r.sub; } },
              { t: '关注点', w: '320px', render: function (r) { return r.flags; } },
              { t: '操作', render: function (r) { return r.act; } }
            ],
            rows: rows.map(row),
            empty: '当前没有待复核记录'
          })
      });

    return {
      html: UI.shell(UI.page({
        pageKey: 'verify',
        title: '待复核工作台',
        sub: '复核确认人员：查看 → 电子签名确认 / 退回修改（FR-901 ~ FR-906）',
        actions: '<a class="btn" href="#/records">查看全部记录</a><a class="btn" href="#/export">批量导出</a>',
        body: body
      }), '/verify'),
      pageKey: 'verify'
    };
  };

  /* ======================================================================
     复核详情（FR-902 ~ FR-906、FR-909）
     ====================================================================== */
  Views.verifyDetail = function (id) {
    var r = Store.rec(id);
    if (!r) {
      return {
        html: UI.shell(UI.page({ pageKey: 'verifyDetail', title: '记录不存在', body: UI.alert('warn', '未找到记录', '记录编号 ' + UI.esc(id) + ' 不存在。') }), '/verify'),
        pageKey: 'verifyDetail'
      };
    }
    var d = Store.dev(r.device);
    var ev = R.evaluate(r, d);
    var active = (Store.state.player.recordId === r.id && Store.state.player.key) || (ev.items[0] && ev.items[0].key);
    var canAct = r.status === '已提交';
    var lowItems = R.lowConfItems(r, d);

    var summary = UI.card({
      title: '记录概要',
      body: '<div class="kv-2">' +
        UI.kv([
          ['记录编号', '<span class="num">' + r.id + '</span>'],
          ['校验日期', '<span class="num">' + r.date + '</span>'],
          ['天平', d.id + ' · ' + UI.esc(d.uniqueNo) + '（' + UI.esc(d.dept) + '）'],
          ['Max / d', d.range1.max + 'g / ' + d.range1.d + 'mg' + (d.range2 ? '；' + d.range2.max + 'g / ' + d.range2.d + 'mg' : '')]
        ]) +
        UI.kv([
          ['砝码盒编号', '<span class="num">' + UI.esc(r.box) + '</span>'],
          ['检验人员', UI.esc(Store.name(r.inspector))],
          ['提交时间', '<span class="num">' + UI.esc(r.submittedAt) + '</span>'],
          ['提交来源', UI.esc(r.submittedFrom)]
        ]) +
        '</div>' +
        UI.kv([
          ['清洁 / 水平调节 / 内校', UI.esc(r.cleanliness) + ' / ' + UI.esc(r.level) + ' / ' + UI.esc(r.internalCal)],
          ['备注', UI.esc(r.remark)]
        ])
    });

    var concl = UI.card({
      title: '判定依据（复核重点）',
      body: '<div class="concl ' + (ev.pass ? 'pass' : 'fail') + '">' +
        '<span class="cc-ico">' + (ev.pass ? '✓' : '!') + '</span>' +
        '<div><h4>' + UI.tag(ev.conclusion, ev.pass ? 'ok' : 'danger', { dot: false }) + '</h4>' +
        '<p>' + UI.esc(R.basisText(r, d, ev)) + '</p></div></div>' +
        (ev.reasons.length ? '<ul class="reason-list">' + ev.reasons.map(function (x) {
          return '<li><b>' + UI.esc(x.label) + '</b>：' + UI.esc(x.detail) + '</li>';
        }).join('') + '</ul>' : '') +
        '<div class="rule-note" style="margin-top:10px">' + UI.esc(APP.template.footerExtra) + '</div>'
    });

    var detailTable = UI.table({
      compact: true,
      cols: [
        { t: '编号', w: '72px', render: function (x) { return '<b class="num">' + x.key + '</b>'; } },
        { t: '标称值', w: '76px', align: 'right', render: function (x) { return '<span class="num">' + x.L + 'g</span>'; } },
        { t: '限度', w: '176px', align: 'right', render: function (x) { return '<span class="num">' + R.fmt(x.lim.lo, x.dec) + '~' + R.fmt(x.lim.hi, x.dec) + 'g</span>'; } },
        { t: '示值', w: '112px', align: 'right', render: function (x) { return x.missing ? '<span class="bad-mark">缺次</span>' : '<span class="num">' + R.fmt(x.value, x.dec) + '</span>'; } },
        { t: '偏差', w: '90px', align: 'right', render: function (x) { return '<span class="num">' + (x.missing ? '—' : R.devStr(x.value, x.L, x.dec)) + '</span>'; } },
        { t: '在限内', w: '84px', align: 'center', render: function (x) { return x.missing ? UI.tag('缺次', 'warn') : UI.tag(x.inLimit ? '是' : '否', x.inLimit ? 'ok' : 'danger'); } },
        { t: '稳定', w: '74px', align: 'center', render: function (x) { return x.stable === false ? UI.tag('否', 'warn') : UI.tag('是', 'muted'); } },
        {
          t: '置信度', w: '112px', align: 'right', render: function (x) {
            var low = R.isLowConf(x.conf);
            return '<span class="num' + (low ? ' bad-mark' : '') + '">' + (x.missing ? '—' : (Math.round(x.conf * 1000) / 10) + '%') + '</span>' +
              (low ? '<span class="cell-flag">低置信</span>' : '');
          }
        }
      ],
      rows: ev.items,
      rowClass: function (x) { return (!x.inLimit || x.missing || x.stable === false) ? 'row-danger' : (R.isLowConf(x.conf) ? 'row-hl' : ''); }
    });

    var mods = (r.modifications || []).length ? UI.table({
      compact: true,
      cols: [
        { t: '时间', w: '140px', render: function (m) { return '<span class="num small">' + UI.esc(m.at) + '</span>'; } },
        { t: '阶段', w: '96px', render: function (m) { return UI.tag(m.stage || '待提交', m.stage === '已提交' ? 'info' : 'muted'); } },
        { t: '字段', w: '140px', render: function (m) { return UI.esc(m.field); } },
        { t: '修改前 → 修改后', w: '250px', render: function (m) { return '<span class="num small">' + UI.esc(m.before) + ' → ' + UI.esc(m.after) + '</span>'; } },
        { t: '操作人', w: '90px', render: function (m) { return UI.esc(Store.name(m.by)); } },
        { t: '理由', render: function (m) { return UI.esc(m.reason); } }
      ],
      rows: r.modifications
    }) : '<div class="empty">本记录无字段修改痕迹</div>';

    var action = UI.card({
      title: '复核确认',
      sub: '确认动作即为电子签名，系统记录复核人账号、姓名、时间与来源终端（FR-903）',
      body: (canAct
        ? UI.alert('info', '请核对以下三项后再确认',
          '① 视频中的 9 次称重示值是否与识别截图一致；② 判定依据与限值、偏差是否可复算；' +
          '③ 低置信字段（本记录 ' + lowItems.length + ' 项）与字段修改痕迹是否合理。' +
          '如发现问题，可退回并填写理由，也可按现行方式口头通知检验人员修改（FR-904、FR-905）。') +
        '<div class="flex-between"><div class="small muted">确认后所有字段锁定；退回后记录回到"待提交"并通知检验人员。</div>' +
        '<div class="btn-group">' +
        '<button class="btn btn-danger" data-act="verify-reject" data-arg="' + r.id + '">退回修改</button>' +
        '<button class="btn btn-pri" data-act="verify-confirm" data-arg="' + r.id + '">确认（电子签名）</button>' +
        '</div></div>'
        : UI.alert('flat', '当前记录状态为"' + r.status + '"', '仅"已提交"状态的记录可执行复核确认或退回（FR-904）。')) +
        '<div class="grid grid-2 mt12">' +
        UI.sig({
          name: Store.name(r.submittedBy) + '（校验人员）', role: Store.roleLabel('inspector'),
          time: r.submittedAt, from: r.submittedFrom, locked: true, note: '一键提交即电子确认'
        }) +
        UI.sig(r.verifiedBy ? {
          name: Store.name(r.verifiedBy) + '（复核确认人）', role: Store.roleLabel('verifier'),
          time: r.verifiedAt, from: r.verifiedFrom, locked: true, note: '复核确认即电子签名'
        } : null) +
        '</div>'
    });

    var body =
      (canAct ? '' : UI.alert('flat', '该记录当前状态为"' + r.status + '"', '复核操作已不可用，如需查看请转到记录详情。')) +
      '<div class="grid grid-side" style="margin-bottom:16px">' + summary + concl + '</div>' +
      UI.card({
        title: '原始视频（占位）与识别截图',
        sub: '复核确认人员可查看记录全部内容：视频、识别截图、示值与限值、判定依据、修改痕迹与低置信标记（FR-902）',
        body: UI.player({ record: r, device: d, activeKey: active }) +
          '<div class="mt16">' + UI.shots(r, d, active) + '</div>'
      }) +
      UI.card({ title: '示值与限值逐项明细', flush: true, body: detailTable }) +
      '<div class="grid grid-2">' +
      UI.card({ title: '字段修改痕迹', sub: '复核确认人员可见（FR-807）', flush: true, body: mods }) +
      action +
      '</div>';

    return {
      html: UI.shell(UI.page({
        pageKey: 'verifyDetail',
        title: '复核详情 <span class="muted small num">' + r.id + '</span>',
        sub: d.id + ' · ' + UI.esc(d.uniqueNo) + ' · 检验人员 ' + UI.esc(Store.name(r.inspector)) + ' · 提交于 ' + UI.esc(r.submittedAt || '—'),
        actions: '<a class="btn" href="#/verify">返回待复核列表</a>' +
          '<a class="btn" href="#/records/' + r.id + '">记录详情</a>',
        body: body
      }), '/verify/' + r.id),
      pageKey: 'verifyDetail'
    };
  };

  /* ======================================================================
     主数据管理：天平档案 + 砝码盒字典（FR-201 ~ FR-212）
     ====================================================================== */
  Views.masterdata = function () {
    var tab = Store.state.masterTab || 'devices';
    var tabs = '<div class="btn-group" style="margin-bottom:14px">' +
      '<button class="btn' + (tab === 'devices' ? ' btn-pri' : '') + '" data-act="master-tab" data-arg="devices">天平档案（' +
      Store.state.devices.length + '）</button>' +
      '<button class="btn' + (tab === 'boxes' ? ' btn-pri' : '') + '" data-act="master-tab" data-arg="boxes">砝码盒字典（' +
      Store.state.weightBoxes.length + '）</button></div>';

    var deviceBody = UI.card({
      title: '天平档案',
      sub: '天平编号由系统按规则生成且唯一；天平唯一号（设备自带）在系统内唯一（FR-202）',
      actions: '<button class="btn btn-sm" data-act="export-devices">导出档案（Excel/CSV）</button>' +
        '<button class="btn btn-sm btn-pri" data-act="device-new">新建天平</button>',
      flush: true,
      body: UI.table({
        cols: [
          { t: '天平编号', w: '96px', render: function (x) { return '<b>' + x.id + '</b>'; } },
          { t: '天平唯一号', w: '130px', render: function (x) { return '<span class="num">' + UI.esc(x.uniqueNo) + '</span>'; } },
          { t: '科室', w: '90px', render: function (x) { return UI.esc(x.dept); } },
          { t: 'Max / d', w: '150px', render: function (x) { return x.range1.max + 'g / ' + x.range1.d + 'mg' + (x.range2 ? '；' + x.range2.max + 'g / ' + x.range2.d + 'mg' : ''); } },
          { t: '量程', w: '84px', align: 'center', render: function (x) { return x.ranges === 2 ? UI.tag('双量程', 'info') : UI.tag('单量程', 'muted'); } },
          {
            t: '砝码标称点 L1 / L2 / L3', w: '190px', render: function (x) {
              return '<span class="num">' + x.points.join(' / ') + ' g</span>' +
                (x.pointAuto ? ' <span class="small muted">（系统推荐）</span>' : ' <span class="small muted">（已人工调整）</span>');
            }
          },
          { t: '容差系数', w: '90px', align: 'right', render: function (x) { return '<span class="num">' + x.tol + '%</span>'; } },
          { t: '默认砝码盒', w: '116px', render: function (x) { return '<span class="num small">' + UI.esc(x.defaultBox || '—') + '</span>'; } },
          { t: '设备二维码内容', w: '130px', render: function (x) { return UI.esc(x.qrContent) + '<div class="small muted num">' + UI.esc(x.qrValue) + '</div>'; } },
          { t: '状态', w: '82px', align: 'center', render: function (x) { return UI.tag(x.status, x.status === '在用' ? 'ok' : 'muted'); } },
          {
            t: '操作', w: '190px', render: function (x) {
              return '<button class="btn-link" data-act="device-edit" data-arg="' + x.id + '">编辑</button>' +
                ' <button class="btn-link" data-act="device-limits" data-arg="' + x.id + '">限度计算</button>' +
                ' <button class="btn-link' + (x.status === '在用' ? ' danger' : '') + '" data-act="device-status" data-arg="' + x.id + '">' +
                (x.status === '在用' ? '停用' : '启用') + '</button>';
            }
          }
        ],
        rows: Store.state.devices
      })
    });

    var boxBody = UI.card({
      title: '砝码盒字典',
      sub: '砝码盒以盒为单位编号，一盒内含多只不同规格砝码，共用同一编号；砝码盒与天平不建立绑定关系（术语表、FR-207）',
      actions: '<button class="btn btn-sm btn-pri" data-act="box-new">新增砝码盒</button>',
      flush: true,
      body: UI.table({
        cols: [
          { t: '砝码盒编号', w: '140px', render: function (b) { return '<b class="num">' + UI.esc(b.id) + '</b>'; } },
          { t: '状态', w: '90px', align: 'center', render: function (b) { return UI.tag(b.status, b.status === '启用' ? 'ok' : 'muted'); } },
          { t: '最近使用', w: '130px', render: function (b) { return '<span class="num">' + UI.esc(b.lastUse) + '</span>'; } },
          { t: '备注', render: function (b) { return UI.esc(b.remark); } },
          {
            t: '操作', w: '150px', render: function (b) {
              return '<button class="btn-link" data-act="box-edit" data-arg="' + b.id + '">编辑</button>' +
                ' <button class="btn-link' + (b.status === '启用' ? ' danger' : '') + '" data-act="box-status" data-arg="' + b.id + '">' +
                (b.status === '启用' ? '停用' : '启用') + '</button>';
            }
          }
        ],
        rows: Store.state.weightBoxes
      })
    });

    var body = UI.alert('info', '主数据维护范围为天平档案、砝码盒字典与科室字典',
      '新增/修改/停用操作均写入审计日志（含修改前后值、操作人、时间，FR-211）。' +
      '停用的天平不得再生成新记录，其历史记录保持可查（FR-206）。' +
      '权限：管理员与复核确认人员可维护；检验人员不可访问（4.1 权限矩阵）。') + tabs +
      (tab === 'devices' ? deviceBody : boxBody) +
      UI.card({
        title: '基础数据字典（FR-1309）',
        body: '<div class="grid grid-2">' +
          UI.kv([['科室', '化学室、理化室（可维护）'], ['内部校正方式', '自动触发 / 手动触发 / NA（三选一）'],
            ['天平编号规则', 'F + 三位序号，如 F001；系统生成，可人工修改']]) +
          UI.kv([['砝码盒编号规则', '字母 + 数字，≤10 位，唯一'], ['天平唯一号规则', '字母 + 数字（设备自带），≤20 位，唯一'],
            ['设备二维码内容', '天平编号（默认）或天平唯一号，两种形式系统均可解析（FR-210）']]) +
          '</div>'
      });

    return {
      html: UI.shell(UI.page({
        pageKey: 'masterdata',
        title: '天平档案与砝码盒字典',
        sub: '新增、修改、停用与查询；砝码标称点自动推荐，限度自动计算并按精度 d 对齐小数位',
        actions: '<a class="btn" href="#/export">导出与打印</a>',
        body: body
      }), '/masterdata'),
      pageKey: 'masterdata'
    };
  };

  /** 天平档案表单（新建 / 编辑弹窗内容） */
  Views.deviceForm = function (d) {
    var isNew = !d;
    var dev = d || {
      id: 'F' + String(Store.state.devices.length + 1).padStart(3, '0'), uniqueNo: '', dept: '化学室',
      ranges: 1, range1: { max: 220, d: 0.1 }, range2: null, internalCal: '自动触发',
      points: [200, 50, 10], tol: 0.05, defaultBox: '', qrContent: '天平编号', qrValue: '',
      status: '在用', remark: '', pointAuto: true
    };
    var rec = R.recommendPoints({ ranges: dev.ranges, range1: dev.range1, range2: dev.range2 || { max: 40, d: 0.01 }, max: dev.range1.max });
    return '<div class="form-grid col3">' +
      UI.field({ label: '天平编号', required: true, control: UI.input('id', dev.id, { attrs: ' data-change="dev-form-field" id="df-id"' }), hint: '系统按规则生成，可修改（FR-202）' }) +
      UI.field({ label: '天平唯一号', required: true, control: UI.input('uniqueNo', dev.uniqueNo, { attrs: ' id="df-unique"' }), hint: '设备自带，字母 + 数字，≤20 位，系统内唯一' }) +
      UI.field({ label: '科室', required: true, control: UI.select('dept', dev.dept, ['化学室', '理化室'], { attrs: ' id="df-dept"' }) }) +
      UI.field({ label: '量程数量', control: UI.select('ranges', dev.ranges, [{ v: '1', t: '单量程' }, { v: '2', t: '双量程' }], { attrs: ' id="df-ranges" data-change="dev-form-ranges"' }) }) +
      UI.field({ label: '第一量程 (g)', control: UI.input('r1max', dev.range1.max, { cls: 'num', attrs: ' id="df-r1max"' }) }) +
      UI.field({ label: '第一量程精度 (mg)', control: UI.input('r1d', dev.range1.d, { cls: 'num', attrs: ' id="df-r1d"' }) }) +
      UI.field({ label: '第二量程 (g)', control: UI.input('r2max', dev.range2 ? dev.range2.max : '', { cls: 'num', attrs: ' id="df-r2max"' }) }) +
      UI.field({ label: '第二量程精度 (mg)', control: UI.input('r2d', dev.range2 ? dev.range2.d : '', { cls: 'num', attrs: ' id="df-r2d"' }) }) +
      UI.field({ label: '内部校正方式', control: UI.select('internalCal', dev.internalCal, ['自动触发', '手动触发', 'NA'], { attrs: ' id="df-cal"' }) }) +
      '<div class="span2">' +
      UI.field({
        label: '砝码标称点 L1 / L2 / L3 (g)', required: true,
        badge: UI.tag('系统推荐值可修改（FR-203）', 'info'),
        control: '<div class="inline-fields">' +
          ['L1', 'L2', 'L3'].map(function (k, i) {
            return '<label class="flex" style="gap:6px"><span class="small muted">' + k + '</span>' +
              '<input class="input num" style="width:92px" id="df-p' + i + '" value="' + (dev.points[i] || rec[i]) + '"></label>';
          }).join('') +
          '<button class="btn btn-sm" data-act="dev-recommend">按量程与精度重新推荐</button></div>',
        hint: '推荐规则：单量程 220g/0.1mg → 200 / 50 / 10；双量程 120g/40g（0.1mg/0.01mg）→ 100 / 20 / 2（FR-203）'
      }) + '</div>' +
      UI.field({ label: '容差系数 (%)', control: UI.input('tol', dev.tol, { cls: 'num', attrs: ' id="df-tol"' }), hint: '默认 0.05%，调整仅对调整后新产生的记录生效（FR-205）' }) +
      UI.field({ label: '默认砝码盒编号', control: UI.input('defaultBox', dev.defaultBox, { attrs: ' id="df-box"' }), hint: '仅为输入便利，不构成绑定关系（FR-209）' }) +
      UI.field({ label: '设备二维码内容', control: UI.select('qrContent', dev.qrContent, ['天平编号', '天平唯一号'], { attrs: ' id="df-qr"' }), hint: '系统两种内容均可解析并映射到天平（FR-210）' }) +
      '<div class="span2">' + UI.field({ label: '备注', control: UI.input('remark', dev.remark, { attrs: ' id="df-remark"' }) }) + '</div>' +
      '</div>' +
      '<div class="rule-note" id="df-preview">限度预览：' +
      [0, 1, 2].map(function (i) {
        var L = dev.points[i] || rec[i];
        var range = dev.ranges === 2 ? (i === 0 ? 1 : 2) : 1;
        var dec = R.decimalsOf({ range1: dev.range1, range2: dev.range2 || { max: 40, d: 0.01 } }, range);
        return 'L' + (i + 1) + ' = ' + L + 'g → ' + R.limitText(L, dec, dev.tol);
      }).join('　　') + '</div>' +
      (isNew ? '<div class="field-hint mt8">新建保存后写入审计日志（FR-211）。</div>' : '') +
      '<input type="hidden" id="df-isedit" value="' + (isNew ? '0' : '1') + '">';
  };

  /* ======================================================================
     记录模板配置（FR-301 ~ FR-306）
     ====================================================================== */
  Views.template = function () {
    var t = Store.state.template;
    var sample = Store.rec('20260928-F001-01');
    var sampleDev = Store.dev('F001');

    var config = UI.card({
      title: '配置项',
      sub: '校验记录表结构固定，与客户现行记录表保持一致；系统不提供自由拖拽式模板设计器（FR-301）',
      body:
        '<div class="form-grid">' +
        UI.field({
          label: '容差系数 (%)',
          control: UI.input('tol', t.tol, { cls: 'num sm', attrs: ' data-change="tpl-tol"' }),
          hint: '默认 0.05%；调整仅对调整后新产生的记录生效（FR-205、FR-302）'
        }) +
        UI.field({
          label: '是否在导出记录中打印"测量时间"行',
          control: '<label class="check-line"><input type="checkbox" class="cb" data-change="tpl-print-time"' +
            (t.printTime ? ' checked' : '') + '> 打印测量时间（默认打印，CR-015 留档要求）</label>'
        }) +
        '<div class="span2">' +
        UI.field({
          label: '页脚 / 备注说明文字',
          control: UI.textarea('footerNote', t.footerNote, { attrs: ' data-change="tpl-footer"' }),
          hint: '显示在打印版式底部，与现行纸质记录表注释一致（FR-302）'
        }) + '</div>' +
        '</div>' +
        '<div class="field-label mt12">字段显隐与显示名称</div>' +
        UI.table({
          compact: true,
          cols: [
            { t: '显示', w: '180px', render: function (r) { return r[0]; } },
            { t: '显示名称', w: '260px', render: function (r) { return r[1]; } },
            { t: '类型', w: '110px', render: function (r) { return r[2]; } }
          ],
          rows: t.fields.map(function (f) {
            return [
              '<label class="check-line"><input type="checkbox" class="cb" data-change="tpl-field-show" data-arg="' + f.key + '"' +
              (f.show ? ' checked' : '') + (f.locked ? ' disabled' : '') + '>' + UI.esc(f.label) + (f.locked ? ' <span class="small muted">（固定）</span>' : '') + '</label>',
              '<input class="input sm" data-change="tpl-field-label" data-arg="' + f.key + '" value="' + UI.esc(f.label) + '"' +
              (f.locked ? ' disabled' : '') + '>',
              f.locked ? UI.tag('固定字段', 'muted') : UI.tag('可配置', 'info')
            ];
          })
        }) +
        '<div class="flex-between mt16"><div class="small muted">当前模板版本 <b>' + t.version +
        '</b> · 变更将生成新版本并记录变更人、时间与变更前后值（FR-303）</div>' +
        '<div class="btn-group"><button class="btn btn-sm" data-act="tpl-reset">恢复默认模板</button>' +
        '<button class="btn btn-sm btn-pri" data-act="tpl-save">保存并生成新版本</button></div></div>'
    });

    var preview = UI.card({
      title: '实时预览',
      sub: '配置项说明与预览效果，避免误配置导致记录表不可读（FR-306）',
      flush: true,
      body: '<div style="background:#eef1f6;padding:14px;overflow:auto">' +
        '<div style="transform:scale(.82);transform-origin:top left;width:122%">' +
        Views.printSheet(sample, sampleDev, { compact: true }) + '</div></div>'
    });

    var versions = UI.card({
      title: '模板版本历史',
      sub: '历史记录按其生成时的模板版本渲染与导出；模板变更不影响已复核确认的记录（FR-303、FR-304）',
      flush: true,
      body: UI.table({
        compact: true,
        cols: [
          { t: '版本', w: '80px', render: function (v) { return '<b>' + v.v + '</b>' + (v.v === Store.state.template.version ? ' <span class="small">（当前）</span>' : ''); } },
          { t: '时间', w: '150px', render: function (v) { return '<span class="num small">' + UI.esc(v.time) + '</span>'; } },
          { t: '操作人', w: '110px', render: function (v) { return UI.esc(Store.name(v.by)); } },
          { t: '变更摘要', render: function (v) { return UI.esc(v.summary); } }
        ],
        rows: Store.state.templateVersions
      })
    });

    var body = UI.alert('info', '模板配置的边界',
      '记录表结构固定，与客户提供的《单日天平校验记录表》《每周天平校验统计记录表》保持一致；' +
      '可配置项为：容差系数、砝码标称点、字段显隐、字段显示名称、页脚/备注说明文字、是否在导出记录中打印"测量时间"行（FR-302）。') +
      '<div class="grid grid-side-l" style="margin-bottom:16px">' + config + preview + '</div>' +
      versions;

    return {
      html: UI.shell(UI.page({
        pageKey: 'template',
        title: '记录模板配置',
        sub: '当前版本 ' + Store.state.template.version + ' · 右侧为打印版式实时预览',
        actions: '<a class="btn" href="#/print/20260928-F001-01">查看完整打印预览</a>',
        body: body
      }), '/template'),
      pageKey: 'template'
    };
  };

  /* ======================================================================
     导出与打印（FR-1103 ~ FR-1108、FR-905、FR-910、AC-014、AC-015）
     ====================================================================== */
  Views.exportPage = function () {
    var st = Store.state.filter.exp = Store.state.filter.exp || { devices: ['F001', 'F002'], from: '2026-09-20', to: '2026-09-26', mode: 'merge', includeUnverified: false };
    var devChecks = Store.state.devices.map(function (d) {
      return '<label class="check-line" style="margin-right:14px"><input type="checkbox" class="cb" data-change="exp-dev" data-arg="' + d.id + '"' +
        (st.devices.indexOf(d.id) >= 0 ? ' checked' : '') + '> ' + d.id + ' · ' + UI.esc(d.uniqueNo) + '</label>';
    }).join('');
    var res = Store.state.exportResult;

    var batchCard = UI.card({
      title: '批量导出（按天平编号 + 日期段）',
      sub: '仅"已复核确认"的记录可导出为正式 PDF（FR-1103、FR-1104）',
      body:
        '<div class="field"><div class="field-label">天平编号（可多选）</div><div class="flex wrap">' + devChecks + '</div></div>' +
        '<div class="inline-fields">' +
        UI.field({ label: '日期起', control: UI.input('efrom', st.from, { type: 'date', cls: 'sm', attrs: ' data-change="exp-from"' }) }) +
        UI.field({ label: '日期止', control: UI.input('eto', st.to, { type: 'date', cls: 'sm', attrs: ' data-change="exp-to"' }) }) +
        UI.field({
          label: '版式', control: UI.select('emode', st.mode, [
            { v: 'merge', t: '合并为一个 PDF' }, { v: 'split', t: '每台天平每日一页（分文件）' }
          ], { cls: 'sm', attrs: ' data-change="exp-mode"' })
        }) +
        UI.field({
          label: '导出内容', control: UI.select('econtent', st.content || 'records', [
            { v: 'records', t: '校验记录（单日记录表版式）' }, { v: 'detail', t: '示值明细汇总表' }, { v: 'both', t: '两者都导出' }
          ], { cls: 'sm', attrs: ' data-change="exp-content"' })
        }) +
        '</div>' +
        '<label class="check-line"><input type="checkbox" class="cb" data-change="exp-unverified"' +
        (st.includeUnverified ? ' checked' : '') + '> 同时导出"待提交 / 已提交"记录（将带"未复核"水印，防止误用作正式记录，FR-1103）</label>' +
        '<div class="flex-between mt16"><div class="small muted">导出文件名规则：天平校验记录_&lt;天平编号&gt;_&lt;日期或日期段&gt;.pdf；批量导出时按记录编号分文件命名（FR-1107）</div>' +
        '<button class="btn btn-pri" data-act="export-generate">生成导出文件</button></div>' +
        (res ? UI.alert('ok', '导出完成（原型模拟）',
          '共 ' + res.count + ' 条记录，生成 ' + res.files.length + ' 个文件：' + res.files.map(function (f) {
            return '<span class="num">' + UI.esc(f) + '</span>';
          }).join('、') + '。导出操作已写入审计日志（导出人、时间、范围、记录条数与文件名称，FR-1108）。') : '')
    });

    var watermark = UI.card({
      title: '水印与导出规则',
      body: '<div class="grid grid-3">' +
        '<div class="path-card"><h3><span class="pc-role">' + UI.tag('正式', 'ok') + '</span>已复核确认</h3><div class="pc-sub" style="margin-bottom:0">可导出为正式 PDF，版式与《电子天平日常校验记录表》一致，A4 可打印留档。</div></div>' +
        '<div class="path-card"><h3><span class="pc-role">' + UI.tag('未复核', 'warn') + '</span>待提交 / 已提交</h3><div class="pc-sub" style="margin-bottom:0">导出时须标注"未复核"水印，防止误用作正式记录（FR-1103）。</div></div>' +
        '<div class="path-card"><h3><span class="pc-role">' + UI.tag('已作废', 'muted') + '</span>已作废</h3><div class="pc-sub" style="margin-bottom:0">不参与统计与批量导出；单条导出时须带"已作废"水印（FR-809）。</div></div>' +
        '</div>'
    });

    var weekCard = UI.card({
      title: '周统计表导出（FR-1105、附录 A.2）',
      sub: '同一台天平同一自然周（周一至周日）的记录并列展示，按实际有记录的日期成列，最多 7 列',
      body: '<div class="inline-fields">' +
        UI.field({ label: '天平编号', control: UI.select('wdev', st.weekDev || 'F001', Store.state.devices.map(function (d) { return { v: d.id, t: d.id + ' · ' + d.uniqueNo }; }), { cls: 'sm', attrs: ' data-change="exp-week-dev"' }) }) +
        UI.field({ label: '周起始（周一）', control: UI.input('wweek', st.week || '2026-09-21', { type: 'date', cls: 'sm', attrs: ' data-change="exp-week"' }) }) +
        '<a class="btn btn-sm btn-pri" href="#/print/week">生成并预览周统计表</a>' +
        '</div>' +
        UI.alert('flat', '统计口径', '取值规则：逐日取该日"已复核确认"记录的对应取值；无记录的日期留空；作废记录不参与统计。' +
          '用途：便于打印后与现有纸质周统计表比对留档。')
    });

    var history = UI.card({
      title: '导出历史',
      sub: '导出操作写入审计日志（FR-1108）',
      flush: true,
      body: UI.table({
        compact: true,
        cols: [
          { t: '时间', w: '150px', render: function (x) { return '<span class="num small">' + UI.esc(x.time) + '</span>'; } },
          { t: '导出人', w: '100px', render: function (x) { return UI.esc(Store.name(x.by)); } },
          { t: '类型', w: '110px', render: function (x) { return x.type; } },
          { t: '范围', w: '260px', render: function (x) { return UI.esc(x.scope); } },
          { t: '条数', w: '70px', align: 'right', render: function (x) { return '<span class="num">' + x.count + '</span>'; } },
          { t: '文件', render: function (x) { return x.files.map(function (f) { return '<div class="num small">' + UI.esc(f) + '</div>'; }).join(''); } }
        ],
        rows: Store.state.exports
      })
    });

    var body = UI.alert('info', '导出与打印能力',
      '单条记录导出 PDF、按天平编号 + 日期段批量导出已复核确认记录、周统计表导出与打印，' +
      'PDF 适配 A4、中文字体本地嵌入，打印效果与现有纸质记录可比（FR-1101 ~ FR-1106）。' +
      '所有角色均可导出（4.1 权限矩阵）。') +
      batchCard + watermark +
      '<div class="grid grid-2">' + weekCard + UI.card({
        title: '单条记录导出',
        body: '<div class="small muted mb12">选择记录后可直接导出或预览打印版式：</div>' +
          UI.select('one', st.one || '20260928-F001-01', Store.recordRows({}).map(function (r) {
            return { v: r.id, t: r.id + '（' + r.status + '）' };
          }), { cls: 'sm', attrs: ' data-change="exp-one"' }) +
          '<div class="btn-group mt12">' +
          '<button class="btn btn-sm" data-act="export-one">导出 PDF</button>' +
          '<a class="btn btn-sm btn-pri" href="#/print/' + (st.one || '20260928-F001-01') + '">打印预览</a>' +
          '<a class="btn btn-sm" href="#/print/blank">空白记录表与卡片清单</a>' +
          '</div>'
      }) + '</div>' +
      history;

    return {
      html: UI.shell(UI.page({
        pageKey: 'exportPage',
        title: '导出与打印',
        sub: '单条 / 批量 PDF 导出、周统计表导出与打印版式预览',
        actions: '<a class="btn" href="#/records">记录查询</a>',
        body: body
      }), '/export'),
      pageKey: 'exportPage'
    };
  };

})();
