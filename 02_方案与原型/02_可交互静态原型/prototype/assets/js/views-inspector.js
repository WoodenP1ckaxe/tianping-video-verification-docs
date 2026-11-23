/* ==========================================================================
   views-inspector.js — 工作台、视频上传、我的上传与分析队列、记录核对与提交
   ========================================================================== */
(function () {
  'use strict';

  var APP = window.APP, Store = window.Store, UI = window.UI, R = APP.Rules, T = APP.time;
  var Views = window.Views = window.Views || {};

  function radioGroup(name, value, attrs, act) {
    return '<div class="radio-row">' + ['是', '否', 'NA'].map(function (v) {
      return '<label><input type="radio" name="' + name + '" value="' + v + '"' +
        (value === v ? ' checked' : '') + ' data-change="' + act + '" data-arg="' + name + '"' +
        (attrs || '') + '>' + v + '</label>';
    }).join('') + '</div>';
  }

  /* ======================================================================
     工作台（检验人员）
     ====================================================================== */
  Views.workbench = function () {
    var me = Store.state.user;
    var drafts = Store.state.records.filter(function (r) { return r.status === '待提交' && r.inspector === me.id; });
    var myTasks = Store.visibleTasks();
    var running = myTasks.filter(function (t) { return t.status === '排队中' || t.status === '分析中'; });
    var submittedToday = Store.state.records.filter(function (r) {
      return r.inspector === me.id && r.submittedAt && r.submittedAt.slice(0, 10) === '2026-09-28';
    }).length;

    function draftRow(r) {
      var d = Store.dev(r.device);
      var ev = R.evaluate(r, d);
      var low = R.lowConfItems(r, d).length + R.lowConfFields(r).length;
      return {
        id: '<a class="num" href="#/records/' + r.id + '">' + r.id + '</a>',
        dev: d.id + ' · ' + UI.esc(d.uniqueNo),
        concl: UI.tag(ev.conclusion, ev.pass ? 'ok' : 'danger'),
        low: low ? UI.tag(low + ' 项待核对', 'warn') : UI.tag('无', 'muted'),
        rej: r.rejectedAt ? '<span class="small bad-mark">已退回：' + UI.esc(r.rejectReason || '') + '</span>' : '<span class="small muted">—</span>',
        act: '<a class="btn btn-sm btn-pri" href="#/review/' + r.id + '">核对并提交</a>'
      };
    }

    var body =
      UI.alert('info', '三步操作即可完成日常校验',
        '① 上传视频　② 核对记录并一键提交　③ 查询与导出（QR-004）。分析由分析服务在后台按上传顺序串行完成，' +
        '上传后无需守在电脑前。') +
      '<div class="grid grid-4" style="margin-bottom:16px">' +
      '<div class="stat warn"><div class="stat-label">待我核对提交</div><div class="stat-value">' + drafts.length + '</div><div class="stat-hint">分析完成后的记录草稿</div></div>' +
      '<div class="stat"><div class="stat-label">我的分析任务</div><div class="stat-value">' + running.length + '</div><div class="stat-hint">排队中 / 分析中</div></div>' +
      '<div class="stat ok"><div class="stat-label">今日已提交</div><div class="stat-value">' + submittedToday + '</div><div class="stat-hint">2026-09-28</div></div>' +
      '<div class="stat"><div class="stat-label">待复核（全部人员）</div><div class="stat-value">' + Store.pendingVerify().length + '</div><div class="stat-hint">等待复核确认人员电子签名</div></div>' +
      '</div>' +
      UI.card({
        title: '待我核对并提交的记录', sub: '低置信字段需核对后方可提交（FR-612、FR-805）', flush: true,
        body: UI.table({
          cols: [
            { t: '记录编号', w: '160px', render: function (r) { return r.id; } },
            { t: '天平', w: '190px', render: function (r) { return r.dev; } },
            { t: '判定结论', w: '96px', align: 'center', render: function (r) { return r.concl; } },
            { t: '低置信 / 待核对', w: '130px', align: 'center', render: function (r) { return r.low; } },
            { t: '退回情况', render: function (r) { return r.rej; } },
            { t: '操作', w: '130px', render: function (r) { return r.act; } }
          ],
          rows: drafts.map(draftRow),
          empty: '当前没有待核对记录，可先上传新的校验视频'
        })
      }) +
      UI.card({
        title: '我的最近上传', sub: '仅显示本人任务（4.1 权限矩阵）', flush: true,
        actions: '<a class="btn btn-sm" href="#/tasks">查看全部任务与队列</a>',
        body: UI.table({
          compact: true,
          cols: [
            { t: '任务号', w: '150px', render: function (t) { return '<span class="num">' + t.id + '</span>'; } },
            { t: '文件名', render: function (t) { return UI.esc(t.file); } },
            { t: '上传时间', w: '140px', render: function (t) { return '<span class="num small">' + UI.esc(t.queuedAt) + '</span>'; } },
            { t: '状态', w: '110px', align: 'center', render: function (t) { return UI.statusTag(t.status); } },
            { t: '说明', w: '240px', render: function (t) {
              if (t.recordId) return '<a href="#/records/' + t.recordId + '">查看生成记录</a>';
              if (t.reason) return '<span class="small muted">' + UI.esc(t.reason.slice(0, 40)) + '…</span>';
              return '<span class="small muted">' + (t.status === '排队中' ? '队列位置 ' + Store.queuePos(t.id) : '—') + '</span>';
            } }
          ],
          rows: myTasks.slice(0, 5),
          empty: '暂无上传记录'
        })
      }) +
      UI.card({
        title: '快捷入口',
        body: '<div class="grid grid-3">' +
          '<a class="path-card" href="#/upload" style="text-decoration:none">' +
          '<h3>' + UI.icon('upload', 18) + ' 上传校验视频</h3><div class="pc-sub" style="margin-bottom:0">支持 mp4 / mov，单文件 ≤500MB；PC 与手机浏览器均可（FR-401、FR-402）</div></a>' +
          '<a class="path-card" href="#/records" style="text-decoration:none">' +
          '<h3>' + UI.icon('search', 18) + ' 查询历史记录</h3><div class="pc-sub" style="margin-bottom:0">按天平编号 + 日期段查询全部记录（FR-1001、FR-1007）</div></a>' +
          '<a class="path-card" href="#/history/F001" style="text-decoration:none">' +
          '<h3>' + UI.icon('chart', 18) + ' 示值明细汇总</h3><div class="pc-sub" style="margin-bottom:0">按标称点比对历次读数与是否在限内（FR-1004）</div></a>' +
          '</div>'
      });

    return {
      html: UI.shell(UI.page({
        pageKey: 'workbench',
        title: '工作台',
        sub: '欢迎回来，' + UI.esc(me.name) + '（' + me.id + '） · 当前时间 ' + Store.now(),
        actions: '<a class="btn btn-pri" href="#/upload">上传校验视频</a>',
        body: body
      }), '/workbench'),
      pageKey: 'workbench'
    };
  };

  /* ======================================================================
     视频上传（FR-401 ~ FR-411、AC-006、AC-022）
     ====================================================================== */
  var SAMPLES = [
    { name: 'VID_20260928_1005.mp4', size: 29.3, device: 'F001' },
    { name: 'VID_20260928_1012.mp4', size: 31.8, device: 'F002' }
  ];
  APP._samples = SAMPLES;

  Views.upload = function () {
    var me = Store.state.user;
    var up = Store.state.upload || {};
    var devOpts = Store.state.devices.filter(function (d) { return d.status === '在用'; })
      .map(function (d) { return { v: d.id, t: d.id + ' · ' + d.uniqueNo + '（' + d.dept + '）' }; });

    var drop = '<div class="drop" data-act="pick-file">' +
      '<div class="di">' + UI.icon('upload', 22) + '</div>' +
      '<b>拖拽视频文件到此处，或点击选择文件</b>' +
      '<span>支持 mp4 / mov；单文件 ≤500MB，时长建议 ≤30 分钟；视频编码需为 H.264，音频 AAC</span>' +
      '</div>' +
      '<div class="flex mt12" style="gap:8px">' +
      SAMPLES.map(function (s, i) {
        return '<button class="btn btn-sm" data-act="upload-sample" data-arg="' + i + '">使用示例文件：' + s.name + '（' + s.size + 'MB）</button>';
      }).join('') +
      '</div>' +
      '<input type="file" id="file-input" accept=".mp4,.mov,video/mp4,video/quicktime" style="display:none" data-change="upload-file">';

    var fileChip = '';
    if (up.name) {
      var ext = (up.name.split('.').pop() || '').toLowerCase();
      var badExt = ['mp4', 'mov'].indexOf(ext) < 0;
      var tooBig = up.size > APP.FILE_RULES.maxSizeMB;
      fileChip = '<div class="file-chip"><span class="fc-ico">' + UI.icon('camera', 17) + '</span>' +
        '<span class="fc-meta"><b>' + UI.esc(up.name) + '</b><i>' + up.size + 'MB · ' + ext.toUpperCase() +
        ' · SHA-256 校验值待计算（FR-408）</i></span>' +
        (badExt || tooBig ? UI.tag('校验不通过', 'danger') : UI.tag('格式校验通过', 'ok')) + '</div>';
      if (badExt) fileChip += UI.alert('danger', '文件格式不受支持', '仅支持 mp4 / mov（FR-402）。');
      if (tooBig) fileChip += UI.alert('danger', '文件超出大小上限',
        '单文件不超过 ' + APP.FILE_RULES.maxSizeMB + 'MB、时长不超过 ' + APP.FILE_RULES.maxMinutes + ' 分钟；超出时系统在上传阶段明确拒绝并提示（PR-018）。');
      if (!badExt && !tooBig) {
        fileChip += UI.alert('warn', '未读取到视频拍摄时间元数据，必须人工确认后方可提交分析',
          '系统已默认填入文件时间作为参考值，请核对后填写<b>拍摄开始时间</b>（精确到分钟）。' +
          '校验日期取视频拍摄开始日期；每次读数时间 = 拍摄开始时间 + 视频内时间偏移（FR-404、3.7、AC-006）。');
      }
    }

    var sameDay = up.device ? Store.state.records.filter(function (r) {
      return r.device === up.device && r.date === (up.startTime || Store.now()).slice(0, 10) && r.status !== '已作废';
    }) : [];

    var meta = '';
    if (up.name) {
      meta = UI.card({
        title: '文件信息与上传参数确认',
        sub: '上传时应显示并确认：文件名、文件大小、拍摄开始时间、归属检验人员（FR-403）',
        body: '<div class="form-grid">' +
          UI.field({ label: '文件名', control: UI.input('fname', up.name, { disabled: true }) }) +
          UI.field({ label: '文件大小', control: UI.input('fsize', up.size + ' MB', { disabled: true }) }) +
          UI.field({
            label: '拍摄开始时间', required: true,
            badge: UI.tag('需人工确认', 'warn'),
            control: UI.input('startTime', up.startTime || '', { type: 'datetime-local', attrs: ' data-change="upload-time"' }),
            hint: '视频元数据缺失拍摄时间，必须由上传者确认（FR-404）'
          }) +
          UI.field({
            label: '归属检验人员', control: UI.input('owner', me.name + '（' + me.id + '）', { disabled: true }),
            hint: '默认为当前登录账号；分析时校验视频中的人员卡二维码是否与该账号一致（FR-602）'
          }) +
          UI.field({
            label: '预期天平（可选）',
            control: UI.select('device', up.device || '', devOpts, { placeholder: '由视频中的设备卡自动识别', attrs: ' data-change="upload-device"' }),
            hint: '真实系统中天平档案由视频中设备卡二维码自动带出，此处仅用于演示队列与记录生成'
          }) +
          UI.field({
            label: '演示场景（仅原型）',
            control: UI.select('scenario', up.scenario || 'pass', [
              { v: 'pass', t: '识别结果为"合格"' },
              { v: 'fail', t: '识别结果为"不通过（示值超限）"' },
              { v: 'nocard', t: '未识别到卡面 → 待人工处理（FR-604）' },
              { v: 'failtask', t: '分析失败可重试（FR-504）' }
            ], { attrs: ' data-change="upload-scenario"' }),
            hint: '真实系统中识别结果由分析服务产生，不能预设；此处用于演示不同业务分支'
          }) +
          '<div class="span2">' +
          '<label class="check-line"><input type="checkbox" class="cb" data-change="upload-confirm"' +
          (up.confirmed ? ' checked' : '') + '> 我已核对上述拍摄开始时间与文件信息，并确认该视频符合拍摄要求（附录 B.3）</label>' +
          '</div></div>' +
          (sameDay.length ? UI.alert('warn', '该天平当日已有记录（FR-411）',
            '天平台 ' + up.device + ' 在 ' + (up.startTime || Store.now()).slice(0, 10) + ' 已有 ' + sameDay.length +
            ' 条记录（' + sameDay.map(function (r) { return r.id + ' / ' + r.status; }).join('、') + '）。' +
            '可继续创建新记录（用于补拍或重做），各记录独立判定、独立复核、互不覆盖。') : '')
      });
    }

    var progress = '';
    if (up.uploading) {
      progress = UI.card({
        title: '上传中', sub: '支持进度显示、失败重试与断点续传（FR-405、AC-022）',
        body: '<div class="flex-between"><span>正在上传 ' + UI.esc(up.name) + '</span>' +
          '<span class="num" id="upload-pct">0%</span></div>' +
          '<div class="progress"><div class="pv" id="upload-bar" style="width:0%"></div></div>' +
          '<div class="field-hint">网络中断后可从已完成分片继续上传，上传完成后重新计算文件校验值并与本地比对（FR-405、FR-408）</div>'
      });
    }

    var canSubmit = up.name && up.confirmed && up.startTime && !up.uploading &&
      (up.name.split('.').pop() || '').toLowerCase().match(/^(mp4|mov)$/) && up.size <= APP.FILE_RULES.maxSizeMB;

    var shootRules = UI.card({
      title: '拍摄要求（客户配合事项，附录 B.3）',
      body: '<div class="grid grid-2"><div><ul class="reason-list" style="color:var(--ink-2)">' +
        '<li>使用固定支架拍摄，手机位置与焦距全程保持一致，画面同时覆盖天平显示屏与称重仓</li>' +
        '<li>视频开头 5 秒内依次清晰展示<b>人员卡</b>与<b>设备卡</b>，每张正对镜头、距离 20~30cm、停留不少于 2 秒</li>' +
        '<li>每次称重读数稳定后停留不少于 3 秒再取下砝码，便于取得稳定读数</li>' +
        '</ul></div><div><ul class="reason-list" style="color:var(--ink-2)">' +
        '<li>口述"第一次"…"第九次"关键词，语速正常、吐字清晰（FR-605、FR-1201）</li>' +
        '<li>手机拍摄格式设为 H.264 兼容格式；若默认 HEVC/H.265 需改为"兼容性最佳"</li>' +
        '<li>单段视频建议不超过 30 分钟、不超过 500MB</li>' +
        '</ul></div></div>' +
        '<div class="rule-note" style="margin-top:4px">存储路径规则：<b>年份/月份/天平编号/记录编号</b>（FR-408）；' +
        '原始视频只读保存，系统不得修改或覆盖（CR-013）</div>'
    });

    var body = UI.alert('info', '本页为检验人员专用功能',
      '仅"检验人员"角色可上传视频，上传成功后系统自动创建分析任务，初始状态为"排队中"（FR-406）。' +
      '分析服务按上传顺序单机串行处理，同一时刻只处理一段视频（FR-501、FR-502）。') +
      UI.card({ title: '选择校验视频', body: drop + fileChip }) +
      meta + progress + shootRules +
      '<div class="flex" style="justify-content:flex-end;gap:8px">' +
      '<a class="btn" href="#/tasks">查看我的上传与任务</a>' +
      '<button class="btn btn-pri" data-act="upload-start"' + (canSubmit ? '' : ' disabled') + '>确认并提交分析</button>' +
      '</div>';

    return {
      html: UI.shell(UI.page({
        pageKey: 'upload',
        title: '视频上传',
        sub: 'PC 浏览器与手机浏览器均可上传，页面响应式适配（FR-401）',
        actions: '<a class="btn" href="#/tasks">我的上传与任务</a>',
        body: body
      }), '/upload'),
      pageKey: 'upload'
    };
  };

  /* ======================================================================
     我的上传与分析队列（FR-501 ~ FR-508、AC-004、AC-005、AC-017、AC-018）
     ====================================================================== */
  Views.tasks = function () {
    var me = Store.state.user;
    var tasks = Store.visibleTasks();
    var q = Store.queueList();
    var cur = Store.analyzingTask();
    var isInspector = me.role === 'inspector';
    var canManage = Store.can('task.manage');

    var monitor = '<div class="grid grid-4" style="margin-bottom:16px">' +
      '<div class="stat info"><div class="stat-label">当前分析任务</div><div class="stat-value" style="font-size:16px">' +
      (cur ? UI.esc(cur.id) : '空闲') + '</div><div class="stat-hint">' + (cur ? UI.esc(cur.file) : '队列空闲，可开始下一段') + '</div></div>' +
      '<div class="stat"><div class="stat-label">队列长度</div><div class="stat-value">' + q.length + '</div><div class="stat-hint">单机串行，同一时刻仅处理 1 段（FR-501）</div></div>' +
      '<div class="stat"><div class="stat-label">平均单段耗时</div><div class="stat-value">' + Store.state.queue.avgMinutes + '<span style="font-size:13px"> 分钟</span></div><div class="stat-hint">今日已完成 ' + Store.state.queue.todayDone + ' 段</div></div>' +
      '<div class="stat danger"><div class="stat-label">失败次数（今日）</div><div class="stat-value">' + Store.state.queue.failedToday + '</div><div class="stat-hint">失败任务保留原因并可重试（FR-504）</div></div>' +
      '</div>';

    function taskRow(t) {
      var d = Store.dev(t.device);
      var pos = Store.queuePos(t.id);
      return {
        id: '<span class="num nowrap">' + t.id + '</span>',
        file: '<div class="nowrap" style="max-width:220px;overflow:hidden;text-overflow:ellipsis">' + UI.esc(t.file) + '</div>' +
          '<div class="small muted">' + t.size + 'MB · ' + UI.esc(t.source) + '</div>',
        owner: UI.esc(Store.name(t.user)) + (isInspector ? '' : '<div class="small muted">' + t.user + '</div>'),
        dev: d ? d.id + '<div class="small muted">' + UI.esc(d.uniqueNo) + '</div>' : '<span class="muted">由视频识别</span>',
        status: UI.statusTag(t.status) + (pos ? '<div class="small muted">队列位置 ' + pos + '</div>' : ''),
        time: '<div class="num small nowrap">' + UI.esc(t.queuedAt) + '</div>' +
          (t.startedAt ? '<div class="num small muted nowrap">' + UI.esc(t.startedAt.slice(11)) + ' → ' +
            UI.esc(t.finishedAt ? t.finishedAt.slice(11) : '进行中') + '</div>' : ''),
        reason: t.reason ? '<span class="small' + (t.status === '失败' ? ' bad-mark' : '') + '">' +
          UI.esc((t.code ? '[' + t.code + '] ' : '') + t.reason) + '</span>' : '<span class="small muted">—</span>',
        act: '<div class="btn-group">' +
          (t.recordId ? '<a class="btn btn-sm" href="#/records/' + t.recordId + '">查看记录</a>' : '') +
          (t.status === '排队中' ? (canManage
            ? '<button class="btn btn-sm" data-act="task-cancel" data-arg="' + t.id + '">取消排队</button>'
            : '<button class="btn btn-sm" disabled title="仅管理员可取消排队任务（FR-507）">取消排队</button>') : '') +
          (t.status === '失败' || t.status === '待人工处理' ? (canManage
            ? '<button class="btn btn-sm btn-pri" data-act="task-retry" data-arg="' + t.id + '">重试</button>'
            : '<button class="btn btn-sm" disabled title="仅管理员可重试失败任务（FR-507）">重试</button>') : '') +
          '</div>'
      };
    }

    var body = UI.alert('info', '分析队列说明',
      '分析服务按上传时间先后顺序（FIFO）串行消费任务，后上传的任务不得插队；' +
      '队列执行不阻塞页面访问、上传、查询、提交与复核（FR-501、FR-502、FR-506）。' +
      (isInspector ? '检验人员只能查看本人任务（FR-507）。' : canManage ? '管理员可查看全部任务并重试、取消排队任务（FR-507）。' : '复核确认人员可查看全部任务，但为只读（4.1 权限矩阵）。')) +
      monitor +
      UI.card({
        title: '演示控制：推进分析队列',
        sub: '真实系统中分析由分析服务自动完成，本按钮仅用于原型演示',
        body: '<div class="flex-between"><div class="small muted">' +
          '点击一次：若无"分析中"任务则启动队首任务；若已有"分析中"任务则将其按预设场景完成（生成待提交记录 / 待人工处理 / 失败）。' +
          '</div><button class="btn btn-pri" data-act="task-advance">▶ 推进分析队列</button></div>'
      }) +
      UI.card({
        title: isInspector ? '我的上传与分析任务' : '分析任务与队列（全部用户）',
        sub: '任务状态：排队中 / 分析中 / 已完成 / 失败 / 待人工处理（FR-503）',
        actions: '<a class="btn btn-sm" href="#/upload">上传新视频</a>',
        flush: true,
        body: UI.table({
          cols: [
            { t: '任务号', w: '152px', render: function (t) { return t.id; } },
            { t: '文件', w: '218px', render: function (t) { return t.file; } }
          ].concat(isInspector ? [] : [
            { t: '归属', w: '96px', render: function (t) { return t.owner; } }
          ]).concat([
            { t: '天平', w: '134px', render: function (t) { return t.dev; } },
            { t: '状态', w: '112px', render: function (t) { return t.status; } },
            { t: '时间', w: '152px', render: function (t) { return t.time; } },
            { t: '失败原因 / 处理提示', render: function (t) { return t.reason; } },
            { t: '操作', w: '178px', render: function (t) { return t.act; } }
          ]),
          rows: tasks.map(taskRow),
          empty: '暂无分析任务',
          rowClass: function (t) {
            if (t.status === '失败') return 'row-danger';
            if (t.status === '待人工处理') return 'row-hl';
            return '';
          }
        })
      }) +
      UI.alert('flat', '异常视频不会阻断流程',
        '无卡面、无读数、中途中断、文件损坏等异常不得导致数据错乱或流程阻塞；任务可重试或标注"待人工处理"（QR-005）。' +
        '服务重启后，正在分析的任务标记为"失败"并可重试，排队中的任务保留并继续排队，不丢失（FR-505、AC-018）。');

    return {
      html: UI.shell(UI.page({
        pageKey: 'tasks',
        title: isInspector ? '我的上传与分析任务' : '分析任务与队列',
        sub: '单机单进程串行队列：同一时刻只处理一段视频，按上传顺序 FIFO 执行',
        actions: isInspector ? '<a class="btn btn-pri" href="#/upload">上传新视频</a>' : '',
        body: body
      }), '/tasks'),
      pageKey: 'tasks'
    };
  };

  /* ======================================================================
     记录核对与提交（FR-605、FR-606、FR-612、FR-701 ~ FR-709、FR-805、FR-806）
     ====================================================================== */
  Views.review = function (id) {
    var r = Store.rec(id);
    if (!r) {
      return {
        html: UI.shell(UI.page({ pageKey: 'review', title: '记录不存在', body: UI.alert('warn', '未找到记录', '记录编号 ' + UI.esc(id) + ' 不存在。') }), '/review'),
        pageKey: 'review'
      };
    }
    var d = Store.dev(r.device);
    var ev = R.evaluate(r, d);
    var active = (Store.state.player.recordId === r.id && Store.state.player.key) || (ev.items[0] && ev.items[0].key);
    var blockers = R.submitBlockers(r, d);
    var locked = r.status !== '待提交';
    var boxOpts = Store.state.weightBoxes.filter(function (b) { return b.status === '启用'; })
      .map(function (b) { return { v: b.id, t: b.id + '（' + b.remark + '）' }; });

    /* --- 左侧：视频占位 + 识别概览 --- */
    var cardSource = '<div class="card" style="margin-bottom:16px"><div class="card-head">' +
      '<div class="card-title">视频与本条识别结果来源</div>' +
      '<div class="card-actions"><span class="small muted">识别截图 9 张已保存，长期保留（FR-611）</span></div></div>' +
      '<div class="card-body">' + UI.player({ record: r, device: d, activeKey: active, tall: true }) + '</div></div>';

    var cardReadCard = UI.card({
      title: '卡片识别结果',
      body: UI.kv([
        ['人员卡（二维码）', UI.tag(r.personCard.account + ' · ' + Store.name(r.personCard.account), 'ok') +
          '<span class="small muted"> 置信度 ' + (Math.round(r.personCard.conf * 1000) / 10) + '%</span>'],
        ['设备卡（二维码）', UI.tag(r.deviceCard.code, 'ok') +
          '<span class="small muted"> → 映射天平 ' + d.id + ' · 置信度 ' + (Math.round(r.deviceCard.conf * 1000) / 10) + '%</span>'],
        ['拍摄开始时间', '<span class="num">' + UI.esc(r.startTime) + '</span>'],
        ['校验日期', '<span class="num">' + r.date + '</span>'],
        ['视频时长', UI.esc(T.dur(r.duration))]
      ]) +
        (r.personCard.account !== r.inspector
          ? UI.alert('danger', '人员卡与登录人员不一致', '不生成记录并提示重新拍摄（FR-602、FR-110、AC-004）。')
          : '')
    });

    /* --- 右侧：可核对字段 --- */
    function speechField(key, label) {
      var sp = (r.speech || {})[key];
      var low = sp && R.isLowConf(sp.conf);
      var checked = R.isChecked(r, 'SP:' + key);
      return UI.field({
        label: label,
        badge: low ? UI.tag(checked ? '已核对' : '待核对', checked ? 'ok' : 'warn') : '',
        control: radioGroup(key, r[key], locked ? ' disabled' : '', 'speech-field') +
          (sp ? '<div class="field-hint">语音识别候选：<b>' + UI.esc(sp.v) + '</b> · 置信度 ' +
            (Math.round(sp.conf * 1000) / 10) + '%' +
            (low ? '　<b style="color:#d97706">低于 ' + (R.CONF_THRESHOLD * 100) + '% 阈值，需人工确认</b>' : '') + '</div>' : ''),
        hint: low && !checked && !locked
          ? '<button class="btn btn-sm" data-act="mark-speech" data-arg="' + key + '">标记已核对（采用候选值）</button>'
          : null
      });
    }

    var fieldCard = UI.card({
      title: '记录字段核对',
      sub: locked ? '当前状态为"' + r.status + '"，字段不可修改' : '低置信与待核对项已高亮，修正需填写理由并留痕（FR-806）',
      body: '<div class="form-grid">' +
        UI.field({
          label: '砝码盒编号', required: true,
          control: UI.select('box', r.box || '', boxOpts, {
            placeholder: '请选择或输入', attrs: ' data-change="field-box"' + (locked ? ' disabled' : '')
          }),
          hint: '由检验人员在提交前输入或从字典选择；不在字典内时可确认后新增（FR-208）。天平档案默认值' +
            '<b>' + UI.esc(d.defaultBox) + '</b> 仅为输入便利，不构成绑定关系（FR-209）。' +
            '<a class="btn-link" href="#/masterdata">维护砝码盒字典</a>'
        }) +
        speechField('cleanliness', '清洁') +
        speechField('level', '水平调节') +
        speechField('internalCal', '内部校正是否通过') +
        '<div class="span2">' +
        UI.field({
          label: '备注', badge: UI.tag('默认"无"', 'muted'),
          control: UI.textarea('remark', r.remark, { attrs: locked && r.status !== '已提交' ? ' disabled' : '' }),
          hint: r.status === '已提交'
            ? '已提交状态下仅"备注"字段允许由检验人员修改，修改留痕且复核确认人员可见（FR-807、AC-011）'
            : '异常情况应在备注栏准确记录，必要时及时报修（与现行纸质记录表注释一致）'
        }) +
        (locked && r.status !== '已提交' ? '' :
          '<button class="btn btn-sm" data-act="save-remark">保存备注</button>') +
        '</div>' +
        '</div>'
    });

    /* --- 9 次示值核对表 --- */
    function readoutTable() {
      return UI.table({
        compact: true,
        cols: [
          { t: '编号', w: '74px', render: function (x) { return '<b class="num">' + x.key + '</b>'; } },
          { t: '量程', w: '70px', align: 'center', render: function (x) { return '<span class="small">' + x.rangeLabel + '</span>'; } },
          { t: '标称值 L', w: '80px', align: 'right', render: function (x) { return '<span class="num">' + x.L + 'g</span>'; } },
          { t: '限度', w: '176px', align: 'right', render: function (x) { return '<span class="num">' + R.fmt(x.lim.lo, x.dec) + '~' + R.fmt(x.lim.hi, x.dec) + 'g</span>'; } },
          {
            t: '识别示值（可修正）', w: '150px', align: 'right', render: function (x) {
              if (x.missing) {
                return '<button class="btn btn-sm" data-act="edit-readout" data-arg="' + x.key + '"' + (locked ? ' disabled' : '') + '>补录读数</button>';
              }
              var cls = 'readout-input' + (R.isLowConf(x.conf) ? ' low' : '') + (!x.inLimit ? ' bad' : '');
              return '<input class="' + cls + '" readonly value="' + R.fmt(x.value, x.dec) + '" ' +
                (locked ? 'disabled' : 'data-act="edit-readout" data-arg="' + x.key + '"') + '>';
            }
          },
          { t: '偏差', w: '90px', align: 'right', render: function (x) { return '<span class="num">' + (x.missing ? '—' : R.devStr(x.value, x.L, x.dec)) + '</span>'; } },
          {
            t: '在限内', w: '86px', align: 'center', render: function (x) {
              if (x.missing) return UI.tag('缺次', 'warn');
              return UI.tag(x.inLimit ? '是' : '否', x.inLimit ? 'ok' : 'danger');
            }
          },
          { t: '稳定', w: '76px', align: 'center', render: function (x) { return x.stable === false ? UI.tag('否', 'warn') : UI.tag('是', 'muted'); } },
          {
            t: '置信度 / 核对', w: '170px', align: 'right', render: function (x) {
              if (x.missing) return '<span class="small bad-mark">未识别到有效读数</span>';
              var low = R.isLowConf(x.conf);
              var checked = R.isChecked(r, 'RO:' + x.key);
              return '<span class="num' + (low ? ' bad-mark' : '') + '">' + (Math.round(x.conf * 1000) / 10) + '%</span>' +
                (low ? '<span class="cell-flag">' + (checked ? '已核对' : '低置信·需核对') + '</span>' : '') +
                (low && !checked && !locked
                  ? '<button class="btn btn-sm" data-act="mark-readout" data-arg="' + x.key + '">标记已核对</button>' : '');
            }
          },
          {
            t: '截图', w: '76px', align: 'center',
            render: function (x) { return '<button class="btn-link" data-act="player-jump" data-arg="' + x.key + '">查看</button>'; }
          }
        ],
        rows: ev.items,
        rowClass: function (x) {
          if (x.missing || !x.inLimit || x.stable === false) return 'row-danger';
          if (R.isLowConf(x.conf) && !R.isChecked(r, 'RO:' + x.key)) return 'row-hl';
          return '';
        }
      });
    }

    var shotsCard = UI.card({
      title: '识别截图与置信度（每格可点击定位到对应读数）',
      sub: '共 ' + ev.items.length + ' 张 · 含显示区、示值与视频时间偏移，用于人工核对与追溯（FR-611）',
      body: UI.shots(r, d, active)
    });

    /* --- 判定结论 + 提交 --- */
    var conclCard = UI.card({
      title: '判定结论（随修正实时重算）',
      sub: '判定由系统自动完成，不提供人工改判入口；修正读数后按修正值重新判定（FR-708、FR-709）',
      body: '<div class="concl ' + (ev.pass ? 'pass' : 'fail') + '">' +
        '<span class="cc-ico">' + (ev.pass ? '✓' : '!') + '</span>' +
        '<div><h4>' + UI.tag(ev.conclusion, ev.pass ? 'ok' : 'danger', { dot: false }) +
        '<span class="muted small"> 　容差系数 ' + ev.tol + '%（天平档案 / 模板参数）</span></h4>' +
        '<p>' + UI.esc(R.basisText(r, d, ev)) + '</p></div></div>' +
        (ev.reasons.length ? '<ul class="reason-list">' + ev.reasons.map(function (x) {
          return '<li><b>' + UI.esc(x.label) + '</b>：' + UI.esc(x.detail) + '</li>';
        }).join('') + '</ul>' : '') +
        '<div class="rule-note" style="margin-top:12px">|I − L| ≤ 0.05% × L（含端点）　→　' +
        'I1-1 ' + R.fmt(ev.items[0].value, ev.items[0].dec) + 'g ∈ [' + R.fmt(ev.items[0].lim.lo, ev.items[0].dec) +
        ', ' + R.fmt(ev.items[0].lim.hi, ev.items[0].dec) + ']　判定唯一、可复算（QR-001）</div>'
    });

    var submitCard = UI.card({
      title: '一键提交（电子确认）',
      sub: '提交即视为检验人员的电子确认，记录提交人账号、姓名、时间与来源终端（FR-805）',
      body: (blockers.length && !locked
        ? UI.alert('warn', '提交前校验未通过，共 ' + blockers.length + ' 项',
          '<ul class="reason-list" style="margin:0">' + blockers.map(function (b) {
            return '<li>' + UI.esc(b) + '</li>';
          }).join('') + '</ul>')
        : UI.alert('ok', locked ? '当前状态不可提交' : '提交前校验通过',
          locked ? '本记录当前状态为"' + r.status + '"。' + (r.verifiedAt ? '已复核确认后所有字段不可修改（FR-808）。' : '') :
            '低置信字段均已核对，必填项非空，可直接提交。')) +
        '<div class="flex-between">' +
        '<div class="small muted">提交后如需修改，仅"备注"字段可改；复核确认后全部锁定。</div>' +
        '<div class="btn-group">' +
        '<button class="btn" data-act="toast-save">保存核对进度</button>' +
        '<button class="btn btn-pri" data-act="review-submit"' + (blockers.length || locked ? ' disabled' : '') + '>一键提交</button>' +
        '</div></div>'
    });

    var mods = (r.modifications && r.modifications.length)
      ? UI.table({
        compact: true,
        cols: [
          { t: '时间', w: '140px', render: function (m) { return '<span class="num small">' + UI.esc(m.at) + '</span>'; } },
          { t: '字段', w: '140px', render: function (m) { return UI.esc(m.field); } },
          { t: '修改前', w: '120px', render: function (m) { return '<span class="num small">' + UI.esc(m.before) + '</span>'; } },
          { t: '修改后', w: '140px', render: function (m) { return '<span class="num small">' + UI.esc(m.after) + '</span>'; } },
          { t: '操作人', w: '90px', render: function (m) { return UI.esc(Store.name(m.by)); } },
          { t: '理由', render: function (m) { return UI.esc(m.reason); } }
        ],
        rows: r.modifications
      })
      : '<div class="empty">尚无修改痕迹</div>';

    var body =
      (locked ? UI.alert('info', '当前记录状态为"' + r.status + '"',
        r.status === '已提交' ? '已提交后仅"备注"可修改（FR-807）；如需更正识别结果，请由复核确认人员退回。'
          : r.status === '已复核确认' ? '已复核确认的记录全部字段锁定（FR-808）。'
            : '已作废记录只读。') : '') +
      '<div class="grid grid-side-l" style="margin-bottom:16px">' +
      '<div>' + cardSource + cardReadCard + '</div>' +
      '<div>' + fieldCard + UI.card({
        title: '语音关键词识别（辅助校验）',
        sub: '"第一次"…"第九次"、"是 / 否 / 无 / 不适用 / 重新称"（FR-605、FR-1201）',
        body: '<div>' +
          '<div class="rule-note" style="margin-bottom:10px">9 次称重的切分以"读数稳定段序列"为主要依据，语音关键词为辅助校验；' +
          '两者冲突时该次读数标记"待核对"并给出两种编号供人工确认（FR-606、FR-1208）。</div>' +
          UI.table({
            compact: true,
            cols: [
              { t: '称重编号', w: '96px', render: function (x, i) { return '<span class="num">第 ' + (i + 1) + ' 次</span>'; } },
              { t: '语音关键词', w: '120px', render: function (x, i) { return '"第' + (i + 1) + '次"'; } },
              { t: '稳定段序列', w: '130px', render: function (x) { return x.key; } },
              { t: '一致性', render: function () { return UI.tag('一致', 'ok'); } }
            ],
            rows: ev.items
          }) + '</div>'
      }) + '</div></div>' +
      UI.card({
        title: '9 次称重示值核对',
        sub: '顺序应为 L1×3 → L2×3 → L3×3' + (d.ranges === 2 ? '；双量程先在高量程完成第 1 个标称点 3 次，再切换量程完成剩余 6 次（FR-703）' : '（FR-703）'),
        actions: '<span class="small muted">点击"识别示值"可修正；修正需填写理由并留痕</span>',
        flush: true,
        body: readoutTable()
      }) +
      shotsCard +
      '<div class="grid grid-side" style="margin-bottom:16px">' + conclCard + submitCard + '</div>' +
      UI.card({ title: '修改痕迹', sub: '记录修改前后值、时间、操作人与理由（FR-805、FR-806）', flush: true, body: mods });

    return {
      html: UI.shell(UI.page({
        pageKey: 'review',
        title: '记录核对与提交 <span class="muted small num">' + r.id + '</span>',
        sub: d.id + ' · ' + UI.esc(d.uniqueNo) + ' · 校验日期 ' + r.date + ' · 砝码盒 ' + UI.esc(r.box || '—'),
        actions: '<a class="btn" href="#/records/' + r.id + '">查看记录详情</a>' +
          (r.status === '已提交' ? '<a class="btn" href="#/verify">前往复核</a>' : ''),
        body: body
      }), '/review/' + r.id),
      pageKey: 'review'
    };
  };

})();
