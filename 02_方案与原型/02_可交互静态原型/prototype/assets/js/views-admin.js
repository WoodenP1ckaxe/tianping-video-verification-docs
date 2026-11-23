/* ==========================================================================
   views-admin.js — 账号与角色管理、审计日志、存储与运行状态
   ========================================================================== */
(function () {
  'use strict';

  var APP = window.APP, Store = window.Store, UI = window.UI, R = APP.Rules, T = APP.time;
  var Views = window.Views = window.Views || {};

  /* ======================================================================
     账号与角色管理（FR-102、FR-103、FR-107 ~ FR-110、FR-108）
     ====================================================================== */
  Views.accounts = function () {
    var rows = Store.state.accounts.map(function (a) {
      var isMe = Store.state.user.id === a.id;
      return {
        id: '<b>' + a.id + '</b>',
        raw: a.status,
        name: UI.esc(a.name) + (isMe ? ' <span class="small muted">（当前登录）</span>' : ''),
        role: UI.tag(Store.roleLabel(a.role), APP.ROLES[a.role].color),
        status: UI.tag(a.status, a.status === '启用' ? 'ok' : 'muted'),
        first: a.firstLogin ? UI.tag('待首次修改', 'warn') : UI.tag('已修改', 'muted'),
        last: '<span class="num small">' + UI.esc(a.lastLogin) + '</span>',
        act: '<div class="btn-group">' +
          '<button class="btn btn-sm" data-act="account-edit" data-arg="' + a.id + '">编辑</button>' +
          '<button class="btn btn-sm" data-act="account-reset" data-arg="' + a.id + '">重置口令</button>' +
          '<button class="btn btn-sm' + (a.status === '启用' ? '' : ' btn-pri') + '" data-act="account-toggle" data-arg="' + a.id + '"' +
          (isMe ? ' disabled title="不能停用当前登录账号"' : '') + '>' + (a.status === '启用' ? '停用' : '启用') + '</button>' +
          '<button class="btn btn-sm btn-danger" data-act="account-delete" data-arg="' + a.id + '"' +
          (isMe ? ' disabled' : '') + '>删除</button>' +
          '</div>'
      };
    });

    var personCards = Store.state.accounts.filter(function (a) { return a.role !== 'admin'; });
    var cardList = UI.card({
      title: '人员卡与设备卡内容清单（供客户自行打印卡片，FR-108、FR-107）',
      sub: '人员卡内容为该人员的账号编号，与账号一一对应；设备卡内容为天平编号或天平唯一号，与天平档案一一绑定（附录 B）',
      actions: '<button class="btn btn-sm" data-act="export-cards">导出卡片内容清单</button>',
      body: '<div class="grid grid-2">' +
        '<div><div class="field-label">人员卡清单</div>' +
        UI.table({
          compact: true,
          cols: [
            { t: '账号', w: '90px', render: function (a) { return '<b class="num">' + a.id + '</b>'; } },
            { t: '姓名', w: '90px', render: function (a) { return UI.esc(a.name); } },
            { t: '角色', w: '120px', render: function (a) { return Store.roleLabel(a.role); } },
            {
              t: '二维码内容', render: function (a) {
                return '<span class="num">' + a.id + '</span>' +
                  (a.status === '停用' ? ' <span class="small muted">（已停用，卡片作废）</span>' : '');
              }
            }
          ],
          rows: personCards
        }) + '</div>' +
        '<div><div class="field-label">设备卡清单</div>' +
        UI.table({
          compact: true,
          cols: [
            { t: '天平编号', w: '90px', render: function (d) { return '<b>' + d.id + '</b>'; } },
            { t: '天平唯一号', w: '130px', render: function (d) { return '<span class="num">' + UI.esc(d.uniqueNo) + '</span>'; } },
            { t: '二维码内容类型', w: '120px', render: function (d) { return UI.esc(d.qrContent); } },
            { t: '二维码内容', render: function (d) { return '<span class="num">' + UI.esc(d.qrValue) + '</span>'; } }
          ],
          rows: Store.state.devices
        }) + '</div>' +
        '</div>' +
        UI.alert('flat', '卡片制作要求（附录 B.2）',
          '尺寸建议不小于 40mm×40mm，纠错等级 H；设备卡固定于天平正面或侧面、拍摄时可清晰入镜且不遮挡显示屏与称重仓；' +
          '人员卡由检验人员随身携带，拍摄开始时正对镜头展示。卡片内容不含姓名、身份证号等敏感信息。')
    });

    var body = UI.alert('info', '账号与权限',
      '三种角色相互独立，一个账号只能属于一种角色；系统按最小权限原则控制访问，本次演示可在顶栏切换账号验证越权拦截（FR-101、FR-105、AC-021）。' +
      '同一账号不得同时承担同一条记录的提交与复核确认操作（FR-110）。') +
      UI.card({
        title: '账号列表', sub: '共 ' + Store.state.accounts.length + ' 个账号',
        actions: '<button class="btn btn-sm btn-pri" data-act="account-new">新增账号</button>',
        flush: true,
        body: UI.table({
          cols: [
            { t: '账号', w: '96px', render: function (r) { return r.id; } },
            { t: '姓名', w: '150px', render: function (r) { return r.name; } },
            { t: '角色', w: '150px', render: function (r) { return r.role; } },
            { t: '状态', w: '90px', align: 'center', render: function (r) { return r.status; } },
            { t: '首次登录改密', w: '120px', align: 'center', render: function (r) { return r.first; } },
            { t: '最近登录', w: '150px', render: function (r) { return r.last; } },
            { t: '操作', render: function (r) { return r.act; } }
          ],
          rows: rows,
          rowClass: function (r) { return r.raw === '停用' ? 'row-danger' : ''; }
        })
      }) +
      UI.card({
        title: '角色权限矩阵（4.1）',
        sub: '原型已按此矩阵控制菜单可见性与页面访问',
        flush: true,
        body: UI.table({
          compact: true,
          cols: [
            { t: '功能', render: function (r) { return r[0]; } },
            { t: '管理员', w: '110px', align: 'center', render: function (r) { return r[1]; } },
            { t: '检验人员', w: '110px', align: 'center', render: function (r) { return r[2]; } },
            { t: '复核确认人员', w: '130px', align: 'center', render: function (r) { return r[3]; } }
          ],
          rows: [
            ['上传视频', '否', '是', '否'],
            ['查看分析任务与队列', '全部', '本人', '全部（只读）'],
            ['重试 / 取消排队任务', '是', '否', '否'],
            ['修正记录字段、填写备注、一键提交', '否', '是（本人记录）', '否'],
            ['复核确认 / 退回', '否', '否', '是'],
            ['记录作废', '是', '否', '否'],
            ['查询全部记录', '是', '是', '是'],
            ['导出单条 / 批量 PDF、周统计', '是', '是', '是'],
            ['天平档案、砝码盒字典维护', '是', '否', '是'],
            ['记录模板参数维护', '是', '否', '是'],
            ['账号与角色管理', '是', '否', '否'],
            ['审计日志查询与导出', '是', '否', '否'],
            ['存储容量配置与运行状态查看', '是', '否', '否']
          ]
        })
      }) +
      cardList;

    return {
      html: UI.shell(UI.page({
        pageKey: 'accounts',
        title: '账号与角色管理',
        sub: '新增、停用、删除账号，重置口令并分配角色；停用账号无法登录但历史记录保持不变（FR-109）',
        actions: '<button class="btn btn-pri" data-act="account-new">新增账号</button>',
        body: body
      }), '/accounts'),
      pageKey: 'accounts'
    };
  };

  /* ======================================================================
     审计日志（FR-1301 ~ FR-1304、AC-026）
     ====================================================================== */
  Views.audit = function () {
    var f = Store.state.filter.audit = Store.state.filter.audit || { from: '', to: '', user: '', type: '' };
    var types = [];
    Store.state.audit.forEach(function (a) { if (types.indexOf(a.type) < 0) types.push(a.type); });
    var rows = Store.state.audit.filter(function (a) {
      if (f.user && a.account !== f.user) return false;
      if (f.type && a.type !== f.type) return false;
      if (f.from && a.time.slice(0, 10) < f.from) return false;
      if (f.to && a.time.slice(0, 10) > f.to) return false;
      return true;
    });
    var shown = rows.slice(0, 40);
    var userOpts = Store.state.accounts.map(function (a) { return { v: a.id, t: a.name + '（' + a.id + '）' }; });

    var body = UI.alert('info', '审计日志为只读记录',
      '系统不提供编辑与删除入口；覆盖登录（成功 / 失败 / 锁定 / 登出）、账号增删与口令重置、天平档案与砝码盒字典变更、模板参数变更、' +
      '视频上传与取消、任务状态变化、分析结果与失败原因、字段修改（前后值 + 理由）、提交、退回、复核确认、记录作废、导出、视频清理、容量告警与备份执行（FR-1301）。' +
      '日志字段包含：时间、操作人账号与姓名、角色、操作类型、对象类型与标识、修改前后值、理由、来源终端 IP、执行结果（FR-1302）。') +
      UI.card({
        title: '审计事件',
        sub: '共 ' + rows.length + ' 条（显示最近 ' + shown.length + ' 条） · 保留期不少于 5 年，可配置（FR-1304）',
        actions: '<button class="btn btn-sm" data-act="export-audit">导出 CSV</button>',
        flush: true,
        body: '<div class="tbl-tools">' +
          '<div class="field" style="margin:0"><div class="field-label">时间起</div>' +
          UI.input('afrom', f.from, { type: 'date', cls: 'sm', attrs: ' data-change="audit-from"' }) + '</div>' +
          '<div class="field" style="margin:0"><div class="field-label">时间止</div>' +
          UI.input('ato', f.to, { type: 'date', cls: 'sm', attrs: ' data-change="audit-to"' }) + '</div>' +
          '<div class="field" style="margin:0"><div class="field-label">操作人</div>' +
          UI.select('auser', f.user, userOpts, { placeholder: '全部', cls: 'sm', attrs: ' data-change="audit-user"' }) + '</div>' +
          '<div class="field" style="margin:0"><div class="field-label">操作类型</div>' +
          UI.select('atype', f.type, types, { placeholder: '全部', cls: 'sm', attrs: ' data-change="audit-type"' }) + '</div>' +
          '<button class="btn btn-sm" data-act="audit-reset">重置</button>' +
          '<span class="btn btn-sm" style="cursor:default;color:#8b95a7">只读 · 无编辑与删除入口</span>' +
          '</div>' +
          UI.table({
            compact: true,
            cols: [
              { t: '时间', w: '140px', render: function (a) { return '<span class="num small">' + UI.esc(a.time) + '</span>' + (a.session ? ' ' + UI.tag('本次会话', 'ok') : ''); } },
              { t: '操作人', w: '140px', render: function (a) { return UI.esc(a.name) + '<div class="small muted">' + a.account + ' · ' + UI.esc(a.role) + '</div>'; } },
              { t: '操作类型', w: '120px', render: function (a) { return UI.tag(a.type, a.result === '失败' ? 'danger' : 'muted'); } },
              { t: '对象', w: '190px', render: function (a) { return UI.esc(a.objType) + '<div class="small muted num">' + UI.esc(a.obj) + '</div>'; } },
              {
                t: '修改前 → 修改后', w: '300px', render: function (a) {
                  if (!a.before && !a.after) return '<span class="small muted">—</span>';
                  return '<span class="num small">' + UI.esc(a.before || '—') + ' → ' + UI.esc(a.after || '—') + '</span>';
                }
              },
              { t: '理由 / 说明', render: function (a) { return '<span class="small">' + UI.esc(a.reason || '—') + '</span>'; } },
              { t: '来源终端 / IP', w: '170px', render: function (a) { return '<span class="num small">' + UI.esc(a.ip) + '</span>'; } },
              { t: '结果', w: '76px', align: 'center', render: function (a) { return UI.tag(a.result, a.result === '成功' ? 'ok' : 'danger'); } }
            ],
            rows: shown,
            rowClass: function (a) { return a.session ? 'row-new' : (a.result === '失败' ? 'row-danger' : ''); },
            empty: '没有符合条件的审计事件'
          })
      }) +
      UI.alert('flat', '本次会话新增事件',
        '你在原型中所做的每一次登录、修改、提交、复核、退回、作废、导出、容量调整与备份操作，都会实时追加到上表并标注"本次会话"（绿色行），' +
        '可现场验证审计留痕的覆盖范围。');

    return {
      html: UI.shell(UI.page({
        pageKey: 'audit',
        title: '审计日志',
        sub: '只读、可查询、可导出；覆盖 4.13 规定的全部事件（QR-014）',
        actions: '<button class="btn" data-act="export-audit">导出 CSV</button>',
        body: body
      }), '/audit'),
      pageKey: 'audit'
    };
  };

  /* ======================================================================
     存储与运行状态（FR-1305 ~ FR-1313、AC-018、AC-019、AC-020）
     ====================================================================== */
  Views.system = function () {
    var s = Store.state.storage;
    var pct = R.rnd(s.used / s.quota * 100, 1);
    var warn90 = pct >= 90;
    var full = pct >= 100;
    var cur = Store.analyzingTask();
    var q = Store.queueList();

    var storageCard = UI.card({
      title: '视频存储配额与容量',
      sub: '配额可配置（默认 200GB）；使用率达到 90% 时界面告警；达到上限时按"最早优先"自动清理（FR-1305）',
      body: '<div class="flex" style="gap:24px;align-items:flex-start;flex-wrap:wrap">' +
        UI.donut(pct, pct + '%', '已用 ' + s.used + ' / ' + s.quota + ' GB') +
        '<div class="grow" style="min-width:280px">' +
        (full ? UI.alert('danger', '已达到配额上限',
          '系统将按"最早优先"自动清理最旧的视频文件；记录、判定结论、识别截图、PDF 与审计日志不受清理影响（FR-1306）。清理动作已写入审计日志（FR-1307）。')
          : warn90 ? UI.alert('warn', '存储使用率已达 ' + pct + '%，超过 90% 告警阈值',
            '建议扩容数据盘或在「存储容量配置」中调整配额；达到上限时系统将按最早优先自动清理视频（FR-1305）。')
            : UI.alert('ok', '存储使用正常', '当前使用率 ' + pct + '%，未达 90% 告警阈值。原始视频按配额滚动清理，记录与审计日志长期保留。')) +
        UI.bar(pct) +
        '<div class="inline-fields mt12">' +
        UI.field({ label: '视频存储配额 (GB)', control: UI.input('quota', s.quota, { cls: 'num sm', attrs: ' data-change="storage-quota"' }) }) +
        UI.field({ label: '预计可保留天数', control: UI.input('retain', s.retainDays + ' 天', { cls: 'num sm', disabled: true }) }) +
        '<button class="btn btn-sm btn-pri" data-act="storage-save">保存配额</button>' +
        '</div>' +
        '<div class="field mt12"><div class="field-label">演示：拖动调整已用容量（原型专用）</div>' +
        '<input type="range" min="5" max="100" value="' + Math.round(pct) + '" style="width:100%" data-change="storage-demo">' +
        '<div class="field-hint">拖到 90% 以上可现场演示告警条与审计记录（AC-019）。真实系统中该数值由文件存储统计得出。</div></div>' +
        '</div></div>' +
        '<div class="mt16">' + UI.table({
          compact: true,
          cols: [
            { t: '天平编号', w: '140px', render: function (x) { return x.id; } },
            { t: '视频段数', w: '110px', align: 'right', render: function (x) { return '<span class="num">' + x.count + '</span>'; } },
            { t: '占用容量', w: '120px', align: 'right', render: function (x) { return '<span class="num">' + x.size + ' GB</span>'; } },
            {
              t: '占比', render: function (x) {
                var p = R.rnd(x.size / s.quota * 100, 1);
                return '<div class="flex" style="gap:8px"><div class="bar" style="flex:1;min-width:120px">' +
                  '<div class="bar-fill ' + (p >= 75 ? 'warn' : 'ok') + '" style="width:' + Math.min(100, p) + '%"></div></div>' +
                  '<span class="small muted num nowrap" style="width:46px;text-align:right">' + p + '%</span></div>';
              }
            }
          ],
          rows: s.byDevice
        }) + '</div>' +
        '<div class="rule-note mt12">清理策略：' + UI.esc(s.cleanPolicy) + '</div>'
    });

    var cleanCard = UI.card({
      title: '视频清理记录',
      sub: '清理动作与容量告警均写入审计日志（FR-1307）',
      flush: true,
      body: UI.table({
        compact: true,
        cols: [
          { t: '清理时间', w: '150px', render: function (c) { return '<span class="num small">' + UI.esc(c.time) + '</span>'; } },
          { t: '文件', w: '250px', render: function (c) { return '<span class="num small">' + UI.esc(c.file) + '</span>'; } },
          { t: '天平', w: '100px', render: function (c) { return c.device; } },
          { t: '释放空间', w: '110px', align: 'right', render: function (c) { return '<span class="num">' + c.size + ' MB</span>'; } },
          { t: '记录影响', render: function () { return UI.tag('记录、截图、PDF 不受影响', 'ok'); } }
        ],
        rows: s.cleaned
      })
    });

    var serviceCard = UI.card({
      title: '服务状态（FR-1308、FR-1313）',
      sub: '健康检查：' + UI.esc(APP.env.health),
      actions: '<button class="btn btn-sm" data-act="health-check">执行健康检查</button>',
      flush: true,
      body: UI.table({
        cols: [
          { t: '组件', w: '140px', render: function (x) { return '<b>' + x.name + '</b>'; } },
          { t: '状态', w: '110px', align: 'center', render: function (x) { return UI.tag(x.status, 'ok', { pulse: true }); } },
          { t: '详情', render: function (x) { return '<span class="small">' + UI.esc(x.detail) + '</span>'; } }
        ],
        rows: APP.services
      })
    });

    var queueCard = UI.card({
      title: '分析队列与运行状态（FR-508）',
      body: '<div class="grid grid-4">' +
        '<div class="stat info"><div class="stat-label">当前任务</div><div class="stat-value" style="font-size:15px">' + (cur ? cur.id : '空闲') + '</div><div class="stat-hint">' + (cur ? UI.esc(cur.file) : '—') + '</div></div>' +
        '<div class="stat"><div class="stat-label">队列长度</div><div class="stat-value">' + q.length + '</div><div class="stat-hint">串行队列，不阻塞页面操作</div></div>' +
        '<div class="stat"><div class="stat-label">平均单段耗时</div><div class="stat-value">' + Store.state.queue.avgMinutes + '<span style="font-size:13px"> 分</span></div><div class="stat-hint">CPU 占用宜 ≤2 核（PR-003）</div></div>' +
        '<div class="stat danger"><div class="stat-label">今日失败</div><div class="stat-value">' + Store.state.queue.failedToday + '</div><div class="stat-hint">可重试，不产生脏数据</div></div>' +
        '</div>' +
        UI.alert('flat', '服务重启恢复说明（AC-018）',
          '应用服务与分析服务异常退出后自动拉起；重启后正在分析的任务标记为"失败"并可重试，排队中的任务保留并继续排队，不丢失（FR-505、FR-1312）。' +
          '服务重启后应在 5 分钟内恢复可用（PR-014）。')
    });

    var envCard = UI.card({
      title: '运行环境与时间同步',
      body: '<div class="kv-2">' +
        UI.kv([
          ['操作系统', UI.esc(APP.env.os)],
          ['容器环境', UI.esc(APP.env.containers)],
          ['数据目录', '/data/tianping（可配置，便于扩容与迁移，CR-010）']
        ]) +
        UI.kv([
          ['NTP 时间同步', UI.tag(APP.env.ntp, 'ok') + ' <span class="small muted">' + UI.esc(APP.env.ntpSource) + '</span>'],
          ['时区', UI.esc(APP.env.timezone)],
          ['服务器时间', '<span class="num">' + UI.esc(APP.env.serverTime) + '</span>']
        ]) +
        '</div>'
    });

    var backupCard = UI.card({
      title: '备份与恢复（FR-1310、FR-1311）',
      sub: '每日自动备份一次（非工作时段），保留最近 30 天；视频不纳入每日备份',
      actions: '<button class="btn btn-sm" data-act="backup-run">手动触发备份</button>' +
        '<button class="btn btn-sm" data-act="log-export">导出运行日志</button>',
      flush: true,
      body: UI.table({
        compact: true,
        cols: [
          { t: '时间', w: '160px', render: function (b) { return '<span class="num small">' + UI.esc(b.time) + '</span>'; } },
          { t: '类型', w: '90px', render: function (b) { return UI.tag(b.type, b.type === '手动' ? 'info' : 'muted'); } },
          { t: '大小', w: '100px', align: 'right', render: function (b) { return '<span class="num">' + b.size + ' MB</span>'; } },
          { t: '保留', w: '90px', render: function (b) { return b.keep; } },
          { t: '结果', w: '86px', align: 'center', render: function (b) { return UI.tag(b.status, 'ok'); } },
          { t: '触发人', render: function (b) { return UI.esc(b.by); } }
        ],
        rows: Store.state.backups
      }),
      foot: '<div class="small muted">备份对象：数据库（账号、主数据、记录、读数、审计日志）、系统配置、模板版本。' +
        '视频文件不纳入系统每日备份，由客户运维按服务器现有备份策略决定是否另行备份。' +
        '验收阶段需完成一次恢复演练（3.8、AC-020）。运行日志分级、可轮转，保留不少于 30 天并支持导出（FR-1311）。</div>'
    });

    var errorCard = UI.card({
      title: '最近错误与告警（FR-1308）',
      flush: true,
      body: UI.table({
        compact: true,
        cols: [
          { t: '时间', w: '150px', render: function (e) { return '<span class="num small">' + UI.esc(e.time) + '</span>'; } },
          { t: '服务', w: '110px', render: function (e) { return e.service; } },
          { t: '错误码', w: '100px', render: function (e) { return '<span class="num">' + e.code + '</span>'; } },
          { t: '描述', render: function (e) { return UI.esc(e.msg); } }
        ],
        rows: APP.errors
      })
    });

    var body = (warn90 ? UI.alert('danger', '存储告警', '视频存储使用率已达 ' + pct + '%，请及时处理。') : '') +
      storageCard + cleanCard +
      '<div class="grid grid-2">' + serviceCard + queueCard + '</div>' +
      '<div class="grid grid-2">' + envCard + errorCard + '</div>' +
      backupCard;

    return {
      html: UI.shell(UI.page({
        pageKey: 'system',
        title: '存储与运行状态',
        sub: '视频配额、各天平占用、服务与队列状态、NTP 时间同步、备份与健康检查',
        actions: '<button class="btn" data-act="backup-run">手动备份</button>' +
          '<button class="btn" data-act="health-check">健康检查</button>',
        body: body
      }), '/system'),
      pageKey: 'system'
    };
  };

})();
