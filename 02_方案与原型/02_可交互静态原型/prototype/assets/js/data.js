/* ==========================================================================
   data.js — 原型内置模拟数据
   数据全部取自《天平校验视频分析系统 需求规格说明书 V0.9》与客户提供
   《电子天平日常校验记录表.xlsx》中的示例，不含任何客户真实生产数据。
   ========================================================================== */
(function () {
  'use strict';

  var APP = window.APP = window.APP || {};

  APP.ROLES = {
    admin: { key: 'admin', label: '管理员', color: 'ink' },
    inspector: { key: 'inspector', label: '检验人员', color: 'info' },
    verifier: { key: 'verifier', label: '复核确认人员', color: 'purple' }
  };

  APP.STATUS_TONE = {
    '排队中': '', '分析中': 'info', '已完成': 'ok', '失败': 'danger', '待人工处理': 'purple',
    '待提交': 'warn', '已提交': 'info', '已复核确认': 'ok', '已作废': 'muted',
    '通过': 'ok', '不通过': 'danger', '启用': 'ok', '停用': 'muted', '在用': 'ok'
  };

  APP.TOL_DEFAULT = 0.05;

  /* ---------------- 时间工具 ---------------- */
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d) {
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  function fmtMin(d) {
    return fmtDate(d) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function parseMin(s) {
    var p = String(s).replace('T', ' ').split(/[-: ]/).map(Number);
    return new Date(p[0], (p[1] || 1) - 1, p[2] || 1, p[3] || 0, p[4] || 0);
  }
  function timeAt(startTime, offSec) {
    var d = parseMin(startTime);
    d.setMinutes(d.getMinutes() + Math.round((offSec || 0) / 60));
    return fmtMin(d);
  }
  function addMin(startTime, mins) {
    var d = parseMin(startTime);
    d.setMinutes(d.getMinutes() + mins);
    return fmtMin(d);
  }
  function dur(sec) {
    var m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m + '分' + p2(s) + '秒';
  }
  APP.time = { p2: p2, fmtDate: fmtDate, fmtMin: fmtMin, parseMin: parseMin, timeAt: timeAt, addMin: addMin, dur: dur };

  /* ---------------- 账号（FR-103） ---------------- */
  APP.accounts = [
    { id: 'U000', name: '系统管理员', role: 'admin', status: '启用', firstLogin: false, pwd: '123456', lastLogin: '2026-09-28 08:02' },
    { id: 'U001', name: '李一', role: 'inspector', status: '启用', firstLogin: true, pwd: '123456', lastLogin: '2026-09-28 08:20' },
    { id: 'U002', name: '李二', role: 'inspector', status: '启用', firstLogin: false, pwd: '123456', lastLogin: '2026-09-28 07:45' },
    { id: 'U003', name: '齐一', role: 'verifier', status: '启用', firstLogin: false, pwd: '123456', lastLogin: '2026-09-28 08:55' },
    { id: 'U004', name: '王三', role: 'inspector', status: '停用', firstLogin: false, pwd: '123456', lastLogin: '2026-06-30 16:40' }
  ];

  /* ---------------- 天平档案（FR-201~FR-206、FR-210） ---------------- */
  APP.devices = [
    {
      id: 'F001', uniqueNo: 'DZTP170911C', dept: '化学室', max: 220, d: 0.1, ranges: 1,
      range1: { max: 220, d: 0.1 }, range2: null,
      internalCal: '手动触发', points: [200, 50, 10], pointRange: [1, 1, 1], pointAuto: false,
      tol: 0.05, defaultBox: 'FM2512920', qrContent: '天平编号', qrValue: 'F001',
      status: '在用', remark: 'Sartorius 七段码 LCD 显示屏'
    },
    {
      id: 'F002', uniqueNo: 'SJS2605002', dept: '化学室', max: 120, d: 0.1, ranges: 2,
      range1: { max: 120, d: 0.1 }, range2: { max: 40, d: 0.01 },
      internalCal: '自动触发', points: [100, 20, 2], pointRange: [1, 2, 2], pointAuto: false,
      tol: 0.05, defaultBox: 'FM2512921', qrContent: '天平唯一号', qrValue: 'SJS2605002',
      status: '在用', remark: 'Mettler Toledo 彩色触摸屏，双量程'
    },
    {
      id: 'F003', uniqueNo: 'SJS2401007', dept: '理化室', max: 620, d: 1, ranges: 1,
      range1: { max: 620, d: 1 }, range2: null,
      internalCal: 'NA', points: [500, 100, 20], pointRange: [1, 1, 1], pointAuto: true,
      tol: 0.05, defaultBox: 'FM2512922', qrContent: '天平编号', qrValue: 'F003',
      status: '停用', remark: '2026-07 送检，停用期间不生成新记录'
    },
    {
      id: 'F004', uniqueNo: 'SJS2605008', dept: '理化室', max: 120, d: 0.1, ranges: 2,
      range1: { max: 120, d: 0.1 }, range2: { max: 40, d: 0.01 },
      internalCal: '自动触发', points: [100, 20, 2], pointRange: [1, 2, 2], pointAuto: true,
      tol: 0.05, defaultBox: 'FM2512921', qrContent: '天平唯一号', qrValue: 'SJS2605008',
      status: '在用', remark: ''
    }
  ];

  /* ---------------- 砝码盒字典（FR-207） ---------------- */
  APP.weightBoxes = [
    { id: 'FM2512920', status: '启用', remark: '200g / 50g / 10g 一组，化学室在用', lastUse: '2026-09-28' },
    { id: 'FM2512921', status: '启用', remark: '100g / 20g / 2g 一组，化学室在用', lastUse: '2026-09-28' },
    { id: 'FM2512922', status: '启用', remark: '500g / 100g / 20g 一组，理化室在用', lastUse: '2026-09-19' },
    { id: 'FM2410088', status: '停用', remark: '砝码盒胶带磨损待送检，暂停使用', lastUse: '2026-06-28' }
  ];

  APP.FILE_RULES = {
    formats: ['mp4', 'mov'],
    maxSizeMB: 500,
    maxMinutes: 30,
    videoCodec: 'H.264（HEVC/H.265 需先在手机端设置为"兼容性最佳"再上传）',
    audioCodec: 'AAC'
  };

  APP._helpers = {
    mkReadouts: function (items) {
      return items.map(function (it, i) {
        if (it === null || typeof it === 'number') it = { v: it };
        return {
          point: Math.floor(i / 3),
          idx: (i % 3) + 1,
          value: it.v === undefined ? null : it.v,
          unit: 'g',
          off: it.o != null ? it.o : 32 + i * 39,
          conf: it.c != null ? it.c : 0.995,
          stable: it.s !== false,
          range: it.r != null ? it.r : 1,
          speech: it.sp || null
        };
      });
    }
  };

  /* ---------------- 记录构造 ---------------- */
  function mkRecord(cfg) {
    var rec = {
      id: cfg.id,
      date: cfg.date,
      device: cfg.device,
      inspector: cfg.inspector,
      box: cfg.box,
      startTime: cfg.startTime,
      duration: cfg.duration || 390,
      file: cfg.file,
      fileSize: cfg.fileSize,
      sha: cfg.sha,
      status: cfg.status,
      cleanliness: cfg.cleanliness || '是',
      level: cfg.level || '是',
      internalCal: cfg.internalCal === undefined ? '是' : cfg.internalCal,
      remark: cfg.remark === undefined ? '无' : cfg.remark,
      readouts: APP._helpers.mkReadouts(cfg.readouts),
      rangeSwitch: cfg.rangeSwitch !== false,
      personCard: cfg.personCard || { account: cfg.inspector, conf: 0.997 },
      deviceCard: cfg.deviceCard || { code: cfg.device, conf: 0.996 },
      speech: cfg.speech || {},
      modifications: cfg.modifications || [],
      analyzedAt: cfg.analyzedAt || null,
      taskId: cfg.taskId || null,
      submittedBy: cfg.submittedBy || null,
      submittedAt: cfg.submittedAt || null,
      submittedFrom: cfg.submittedFrom || null,
      verifiedBy: cfg.verifiedBy || null,
      verifiedAt: cfg.verifiedAt || null,
      verifiedFrom: cfg.verifiedFrom || null,
      voidBy: cfg.voidBy || null,
      voidAt: cfg.voidAt || null,
      voidReason: cfg.voidReason || null
    };
    return rec;
  }

  /* ---------------- 校验记录（12 条，覆盖全部业务状态） ---------------- */
  APP.records = [
    mkRecord({
      id: '20260928-F001-01', date: '2026-09-28', device: 'F001', inspector: 'U001', box: 'FM2512920',
      startTime: '2026-09-28 08:31', duration: 393, file: 'VID_20260928_0831.mp4', fileSize: 26.9,
      sha: 'a7f3c9e2b41d8c05', status: '已复核确认', internalCal: '是', remark: '无',
      analyzedAt: '2026-09-28 08:46', taskId: 'T-20260928-002',
      submittedBy: 'U001', submittedAt: '2026-09-28 08:52', submittedFrom: 'PC-Chrome / 10.20.3.51',
      verifiedBy: 'U003', verifiedAt: '2026-09-28 09:14', verifiedFrom: 'PC-Edge / 10.20.3.44',
      readouts: [200.0062, 200.0031, 199.9987, 50.0002, 49.9988, 50.0011, 10.0001, 9.9994, 10.0006]
    }),
    mkRecord({
      id: '20260928-F001-02', date: '2026-09-28', device: 'F001', inspector: 'U001', box: 'FM2512920',
      startTime: '2026-09-28 09:05', duration: 366, file: 'VID_20260928_0905.mp4', fileSize: 28.4,
      sha: 'b1c07d55ea9f3210', status: '待提交', internalCal: '是', remark: '无',
      analyzedAt: '2026-09-28 09:21', taskId: 'T-20260928-003',
      readouts: [
        { v: 200.0062, c: 0.997 }, { v: 200.3374, c: 0.994 }, { v: 199.9, c: 0.991 },
        { v: 50.0002, c: 0.996 }, { v: 49.9749, c: 0.902 }, { v: 50.0008, c: 0.993 },
        { v: 10.0001, c: 0.995 }, { v: 9.9997, c: 0.994 }, { v: 10.0003, c: 0.996 }
      ]
    }),
    mkRecord({
      id: '20260927-F002-01', date: '2026-09-27', device: 'F002', inspector: 'U002', box: 'FM2512921',
      startTime: '2026-09-27 08:40', duration: 402, file: 'VID_20260927_0840.mp4', fileSize: 31.2,
      sha: 'c3d81a06fb27e944', status: '已复核确认', internalCal: '是',
      remark: '高量程 3 次 → 切换至低量程 6 次',
      analyzedAt: '2026-09-27 08:55', taskId: 'T-20260927-001',
      submittedBy: 'U002', submittedAt: '2026-09-27 09:06', submittedFrom: '手机-Chrome / 10.20.4.18',
      verifiedBy: 'U003', verifiedAt: '2026-09-27 09:31', verifiedFrom: 'PC-Chrome / 10.20.3.44',
      readouts: [
        { v: 100.0003, c: 0.998, r: 1 }, { v: 100.0001, c: 0.995, r: 1 }, { v: 99.9998, c: 0.993, r: 1 },
        { v: 20.00005, c: 0.996, r: 2 }, { v: 19.99997, c: 0.994, r: 2 }, { v: 20.00012, c: 0.992, r: 2 },
        { v: 2.00001, c: 0.991, r: 2 }, { v: 1.99998, c: 0.993, r: 2 }, { v: 2.00002, c: 0.995, r: 2 }
      ]
    }),
    mkRecord({
      id: '20260926-F001-03', date: '2026-09-26', device: 'F001', inspector: 'U001', box: 'FM2512920',
      startTime: '2026-09-26 08:12', duration: 355, file: 'VID_20260926_0812.mp4', fileSize: 24.8,
      sha: 'd92b7f140c8a3e51', status: '待提交', internalCal: 'NA', remark: '无',
      analyzedAt: '2026-09-26 08:29', taskId: 'T-20260926-001',
      speech: {
        cleanliness: { v: '是', conf: 0.94 },
        level: { v: '是', conf: 0.91 },
        internalCal: { v: 'NA', conf: 0.58 }
      },
      readouts: [
        { v: 200.0044, c: 0.996 }, { v: 200.0018, c: 0.735 }, { v: 199.9991, c: 0.681 },
        { v: 50.0006, c: 0.994 }, { v: 49.9993, c: 0.992 }, { v: 50.0009, c: 0.995 },
        { v: 10.0002, c: 0.993 }, { v: 9.9998, c: 0.812 }, { v: 10.0004, c: 0.994 }
      ]
    }),
    mkRecord({
      id: '20260928-F002-01', date: '2026-09-28', device: 'F002', inspector: 'U002', box: 'FM2512921',
      startTime: '2026-09-28 07:58', duration: 388, file: 'VID_20260928_0758.mp4', fileSize: 29.6,
      sha: 'e5a1c4730bd9f260', status: '已提交',
      remark: '低量程砝码盒封条磨损，已更换备用砝码盒',
      analyzedAt: '2026-09-28 08:15', taskId: 'T-20260928-001',
      submittedBy: 'U002', submittedAt: '2026-09-28 08:24', submittedFrom: '手机-Chrome / 10.20.4.18',
      modifications: [{
        field: '备注', before: '无', after: '低量程砝码盒封条磨损，已更换备用砝码盒',
        by: 'U002', at: '2026-09-28 08:41', reason: '提交后补充现场情况说明（FR-807）', stage: '已提交'
      }],
      readouts: [
        { v: 100.0002, c: 0.998, r: 1 }, { v: 100.0006, c: 0.995, r: 1 }, { v: 99.9999, c: 0.993, r: 1 },
        { v: 20.00004, c: 0.996, r: 2 }, { v: 20.00009, c: 0.994, r: 2 }, { v: 19.99998, c: 0.992, r: 2 },
        { v: 2.00003, c: 0.991, r: 2 }, { v: 1.99999, c: 0.994, r: 2 }, { v: 2.00001, c: 0.995, r: 2 }
      ]
    }),
    mkRecord({
      id: '20260925-F002-02', date: '2026-09-25', device: 'F002', inspector: 'U002', box: 'FM2512921',
      startTime: '2026-09-25 09:02', duration: 341, file: 'VID_20260925_0902.mp4', fileSize: 25.7,
      sha: 'f70b2e8813c6a4d9', status: '已复核确认', rangeSwitch: false,
      remark: '视频中未拍摄到量程切换过程段',
      analyzedAt: '2026-09-25 09:19', taskId: 'T-20260925-002',
      submittedBy: 'U002', submittedAt: '2026-09-25 09:26', submittedFrom: 'PC-Edge / 10.20.3.52',
      verifiedBy: 'U003', verifiedAt: '2026-09-25 10:02', verifiedFrom: 'PC-Edge / 10.20.3.44',
      readouts: [
        { v: 100.0004, c: 0.996, r: 1 }, { v: 100.0002, c: 0.994, r: 1 }, { v: 100.0005, c: 0.995, r: 1 },
        { v: 20.00008, c: 0.993, r: 2 }, { v: 20.00003, c: 0.992, r: 2 }, { v: 20.00011, c: 0.994, r: 2 },
        { v: 2.00003, c: 0.991, r: 2 }, { v: 2.00001, c: 0.993, r: 2 }, { v: 2.00004, c: 0.995, r: 2 }
      ]
    }),
    mkRecord({
      id: '20260924-F001-04', date: '2026-09-24', device: 'F001', inspector: 'U001', box: 'FM2512920',
      startTime: '2026-09-24 08:47', duration: 312, file: 'VID_20260924_0847.mp4', fileSize: 22.4,
      sha: '0c4d5a77e29b1836', status: '已复核确认',
      remark: '第 3 只砝码第 3 次称重未拍摄完整，缺少一次读数',
      analyzedAt: '2026-09-24 09:02', taskId: 'T-20260924-002',
      submittedBy: 'U001', submittedAt: '2026-09-24 09:15', submittedFrom: 'PC-Chrome / 10.20.3.51',
      verifiedBy: 'U003', verifiedAt: '2026-09-24 09:40', verifiedFrom: 'PC-Chrome / 10.20.3.44',
      readouts: [
        { v: 200.0007, c: 0.996 }, { v: 200.0011, c: 0.994 }, { v: 200.0004, c: 0.995 },
        { v: 50.0003, c: 0.993 }, { v: 49.9998, c: 0.994 }, { v: 50.0006, c: 0.992 },
        { v: 10.0001, c: 0.995 }, { v: 9.9999, c: 0.993 }, null
      ]
    }),
    mkRecord({
      id: '20260923-F001-05', date: '2026-09-23', device: 'F001', inspector: 'U002', box: 'FM2512920',
      startTime: '2026-09-23 09:11', duration: 348, file: 'VID_20260923_0911.mp4', fileSize: 25.1,
      sha: '1e6f8b3c07d5a239', status: '已复核确认',
      remark: '第 2 只砝码第 1 次称重过程天平示值持续漂移，无稳定平台段',
      analyzedAt: '2026-09-23 09:28', taskId: 'T-20260923-002',
      submittedBy: 'U002', submittedAt: '2026-09-23 09:41', submittedFrom: 'PC-Chrome / 10.20.3.52',
      verifiedBy: 'U003', verifiedAt: '2026-09-23 10:15', verifiedFrom: 'PC-Chrome / 10.20.3.44',
      readouts: [
        { v: 200.0009, c: 0.995 }, { v: 200.0005, c: 0.994 }, { v: 200.0012, c: 0.996 },
        { v: 50.0021, c: 0.886, s: false }, { v: 49.9997, c: 0.993 }, { v: 50.0004, c: 0.994 },
        { v: 10.0003, c: 0.995 }, { v: 9.9996, c: 0.992 }, { v: 10.0001, c: 0.994 }
      ]
    }),
    mkRecord({
      id: '20260922-F001-06', date: '2026-09-22', device: 'F001', inspector: 'U001', box: 'FM2410088',
      startTime: '2026-09-22 08:35', duration: 372, file: 'VID_20260922_0835.mp4', fileSize: 27.3,
      sha: '2b7a4c19f8e0d635', status: '已作废', remark: '无',
      analyzedAt: '2026-09-22 08:52', taskId: 'T-20260922-001',
      submittedBy: 'U001', submittedAt: '2026-09-22 09:01', submittedFrom: 'PC-Chrome / 10.20.3.51',
      voidBy: 'U000', voidAt: '2026-09-22 14:20',
      voidReason: '砝码盒编号填错：实际使用 FM2512920，记录误填 FM2410088，需重新拍摄校验（FR-809）',
      readouts: [
        { v: 200.0021, c: 0.996 }, { v: 200.0014, c: 0.994 }, { v: 199.9997, c: 0.995 },
        { v: 50.0004, c: 0.993 }, { v: 49.9991, c: 0.995 }, { v: 50.0007, c: 0.992 },
        { v: 10.0002, c: 0.994 }, { v: 9.9995, c: 0.993 }, { v: 10.0004, c: 0.996 }
      ]
    }),
    mkRecord({
      id: '20260921-F002-03', date: '2026-09-21', device: 'F002', inspector: 'U001', box: 'FM2512921',
      startTime: '2026-09-21 08:22', duration: 396, file: 'VID_20260921_0822.mp4', fileSize: 30.4,
      sha: '3c8b5d20a9f1e746', status: '已复核确认',
      analyzedAt: '2026-09-21 08:39', taskId: 'T-20260921-001',
      submittedBy: 'U001', submittedAt: '2026-09-21 08:50', submittedFrom: 'PC-Chrome / 10.20.3.51',
      verifiedBy: 'U003', verifiedAt: '2026-09-21 09:20', verifiedFrom: 'PC-Chrome / 10.20.3.44',
      readouts: [
        { v: 100.0001, c: 0.995, r: 1 }, { v: 100.0004, c: 0.996, r: 1 }, { v: 99.9997, c: 0.994, r: 1 },
        { v: 20.00002, c: 0.993, r: 2 }, { v: 20.00007, c: 0.995, r: 2 }, { v: 19.99996, c: 0.992, r: 2 },
        { v: 1.99999, c: 0.994, r: 2 }, { v: 2.00002, c: 0.993, r: 2 }, { v: 2.00005, c: 0.995, r: 2 }
      ]
    }),
    mkRecord({
      id: '20260920-F002-04', date: '2026-09-20', device: 'F002', inspector: 'U002', box: 'FM2512921',
      startTime: '2026-09-20 09:40', duration: 358, file: 'VID_20260920_0940.mp4', fileSize: 26.1,
      sha: '4d9c6e31ba02f857', status: '已复核确认',
      remark: '低量程 20g 第 2 次称重示值超限，已通知设备管理员核查',
      analyzedAt: '2026-09-20 09:57', taskId: 'T-20260920-001',
      submittedBy: 'U002', submittedAt: '2026-09-20 10:08', submittedFrom: 'PC-Edge / 10.20.3.52',
      verifiedBy: 'U003', verifiedAt: '2026-09-20 10:35', verifiedFrom: 'PC-Chrome / 10.20.3.44',
      modifications: [{
        field: '测量示值(I2-2)', before: '20.00103', after: '20.01503',
        by: 'U002', at: '2026-09-20 10:04', reason: '识别截图核对：识别值末位误读，按截图更正（FR-806）', stage: '待提交'
      }],
      readouts: [
        { v: 100.0005, c: 0.995, r: 1 }, { v: 100.0002, c: 0.996, r: 1 }, { v: 100.0007, c: 0.994, r: 1 },
        { v: 20.00008, c: 0.993, r: 2 }, { v: 20.01503, c: 0.962, r: 2 }, { v: 20.00011, c: 0.995, r: 2 },
        { v: 2.00002, c: 0.994, r: 2 }, { v: 1.99999, c: 0.993, r: 2 }, { v: 2.00003, c: 0.995, r: 2 }
      ]
    }),
    mkRecord({
      id: '20260919-F001-07', date: '2026-09-19', device: 'F001', inspector: 'U002', box: 'FM2512920',
      startTime: '2026-09-19 08:15', duration: 379, file: 'VID_20260919_0815.mp4', fileSize: 28.9,
      sha: '5e0d7f42cb13a968', status: '已提交', analyzedAt: '2026-09-19 08:33', taskId: 'T-20260919-001',
      submittedBy: 'U002', submittedAt: '2026-09-19 08:44', submittedFrom: 'PC-Chrome / 10.20.3.52',
      readouts: [
        { v: 200.0033, c: 0.996 }, { v: 200.0027, c: 0.995 }, { v: 199.9994, c: 0.994 },
        { v: 50.0001, c: 0.993 }, { v: 49.9996, c: 0.995 }, { v: 50.0004, c: 0.992 },
        { v: 10.0003, c: 0.994 }, { v: 9.9998, c: 0.993 }, { v: 10.0002, c: 0.995 }
      ]
    })
  ];

  /* ---------------- 分析任务队列（FR-501~FR-508） ---------------- */
  APP.tasks = [
    {
      id: 'T-20260928-004', file: 'VID_20260928_0928.mp4', size: 30.8, device: 'F001', user: 'U001',
      status: '分析中', queuedAt: '2026-09-28 09:30', startedAt: '2026-09-28 09:33', finishedAt: null,
      recordId: null, code: null, reason: null, source: 'PC-Chrome / 10.20.3.51'
    },
    {
      id: 'T-20260928-005', file: 'VID_20260928_0941.mp4', size: 33.5, device: 'F002', user: 'U002',
      status: '排队中', queuedAt: '2026-09-28 09:41', startedAt: null, finishedAt: null,
      recordId: null, code: null, reason: null, source: '手机-Chrome / 10.20.4.18'
    },
    {
      id: 'T-20260928-006', file: 'VID_20260928_0948.mov', size: 45.1, device: 'F001', user: 'U001',
      status: '排队中', queuedAt: '2026-09-28 09:48', startedAt: null, finishedAt: null,
      recordId: null, code: null, reason: null, source: 'PC-Chrome / 10.20.3.51'
    },
    {
      id: 'T-20260928-003', file: 'VID_20260928_0905.mp4', size: 28.4, device: 'F001', user: 'U001',
      status: '已完成', queuedAt: '2026-09-28 09:07', startedAt: '2026-09-28 09:09', finishedAt: '2026-09-28 09:21',
      recordId: '20260928-F001-02', code: null, reason: null, source: 'PC-Chrome / 10.20.3.51'
    },
    {
      id: 'T-20260928-002', file: 'VID_20260928_0831.mp4', size: 26.9, device: 'F001', user: 'U001',
      status: '已完成', queuedAt: '2026-09-28 08:33', startedAt: '2026-09-28 08:35', finishedAt: '2026-09-28 08:46',
      recordId: '20260928-F001-01', code: null, reason: null, source: 'PC-Chrome / 10.20.3.51'
    },
    {
      id: 'T-20260928-001', file: 'VID_20260928_0758.mp4', size: 29.6, device: 'F002', user: 'U002',
      status: '已完成', queuedAt: '2026-09-28 08:00', startedAt: '2026-09-28 08:02', finishedAt: '2026-09-28 08:15',
      recordId: '20260928-F002-01', code: null, reason: null, source: '手机-Chrome / 10.20.4.18'
    },
    {
      id: 'T-20260927-001', file: 'VID_20260927_0840.mp4', size: 31.2, device: 'F002', user: 'U002',
      status: '已完成', queuedAt: '2026-09-27 08:42', startedAt: '2026-09-27 08:44', finishedAt: '2026-09-27 08:55',
      recordId: '20260927-F002-01', code: null, reason: null, source: '手机-Chrome / 10.20.4.18'
    },
    {
      id: 'T-20260926-001', file: 'VID_20260926_0812.mp4', size: 24.8, device: 'F001', user: 'U001',
      status: '已完成', queuedAt: '2026-09-26 08:14', startedAt: '2026-09-26 08:16', finishedAt: '2026-09-26 08:29',
      recordId: '20260926-F001-03', code: null, reason: null, source: 'PC-Chrome / 10.20.3.51'
    },
    {
      id: 'T-20260925-002', file: 'VID_20260925_0912.mp4', size: 27.7, device: null, user: 'U001',
      status: '待人工处理', queuedAt: '2026-09-25 09:14', startedAt: '2026-09-25 09:16', finishedAt: '2026-09-25 09:24',
      recordId: null, code: 'E-1004',
      reason: '人员卡与登录人员不一致：视频中人员卡识别为 U002（李二），当前上传账号为 U001（李一），未生成记录（FR-602 / FR-110）',
      source: 'PC-Chrome / 10.20.3.51'
    },
    {
      id: 'T-20260924-002', file: 'VID_20260924_0847.mp4', size: 23.1, device: 'F001', user: 'U001',
      status: '已完成', queuedAt: '2026-09-24 08:49', startedAt: '2026-09-24 08:51', finishedAt: '2026-09-24 09:02',
      recordId: '20260924-F001-04', code: null, reason: null, source: 'PC-Chrome / 10.20.3.51'
    },
    {
      id: 'T-20260924-001', file: 'VID_20260924_0838.mp4', size: 22.4, device: null, user: 'U001',
      status: '待人工处理', queuedAt: '2026-09-24 08:40', startedAt: '2026-09-24 08:42', finishedAt: '2026-09-24 08:48',
      recordId: null, code: 'E-1002',
      reason: '未识别到人员卡 / 设备卡镜头，未生成正式记录，请补拍含清晰卡面（正面停留 ≥2 秒）的视频后重新上传（FR-604）',
      source: 'PC-Chrome / 10.20.3.51'
    },
    {
      id: 'T-20260923-001', file: 'VID_20260923_0833.mov', size: 51.3, device: null, user: 'U001',
      status: '失败', queuedAt: '2026-09-23 08:35', startedAt: '2026-09-23 08:35', finishedAt: '2026-09-23 08:36',
      recordId: null, code: 'E-2001',
      reason: '视频文件损坏或编码不受支持：检测到 HEVC/H.265 编码，请先在手机端设置为"兼容性最佳"（H.264）后重新上传（FR-402）',
      source: 'PC-Chrome / 10.20.3.51'
    }
  ];

  APP.queue = {
    avgMinutes: 13.4, todayDone: 6, failedToday: 1, maxParallel: 1, lastAdvance: '2026-09-28 09:33'
  };

  /* ---------------- 审计日志（FR-1301~FR-1304） ---------------- */
  function au(time, account, type, objType, obj, before, after, reason, ip, result) {
    var acc = APP.accounts.filter(function (a) { return a.id === account; })[0] || { name: '系统', role: 'admin' };
    var roleLabel = account === '系统' ? '系统自动'
      : acc.role === 'admin' ? '管理员'
        : acc.role === 'inspector' ? '检验人员' : '复核确认人员';
    return {
      id: 'AU-' + time.replace(/[^0-9]/g, '').slice(4) + '-' + Math.random().toString(36).slice(2, 6),
      time: time, account: account, name: acc.name, role: roleLabel, type: type, objType: objType,
      obj: obj, before: before, after: after, reason: reason, ip: ip,
      result: result || '成功', session: false
    };
  }

  APP.audit = [
    au('2026-09-28 09:48', 'U001', '视频上传', '分析任务', 'T-20260928-006', '', '排队中', '文件名 VID_20260928_0948.mov（45.1MB）', '10.20.3.51'),
    au('2026-09-28 09:41', 'U002', '视频上传', '分析任务', 'T-20260928-005', '', '排队中', '文件名 VID_20260928_0941.mp4（33.5MB）', '10.20.4.18'),
    au('2026-09-28 09:33', '系统', '任务状态变化', '分析任务', 'T-20260928-004', '排队中', '分析中', '队列位置 1 → 开始分析', '127.0.0.1'),
    au('2026-09-28 09:30', 'U001', '视频上传', '分析任务', 'T-20260928-004', '', '排队中', '文件名 VID_20260928_0928.mp4（30.8MB）', '10.20.3.51'),
    au('2026-09-28 09:26', 'U003', '登录成功', '账号', 'U003', '', '', '', '10.20.3.44'),
    au('2026-09-28 09:21', '系统', '分析完成', '分析任务', 'T-20260928-003', '分析中', '已完成', '9 次读数全部识别，生成待提交记录 20260928-F001-02', '127.0.0.1'),
    au('2026-09-28 09:14', 'U003', '复核确认', '校验记录', '20260928-F001-01', '已提交', '已复核确认', '电子签名确认', '10.20.3.44'),
    au('2026-09-28 09:09', '系统', '任务状态变化', '分析任务', 'T-20260928-003', '排队中', '分析中', '', '127.0.0.1'),
    au('2026-09-28 09:07', 'U001', '视频上传', '分析任务', 'T-20260928-003', '', '排队中', 'SHA-256 校验值已计算', '10.20.3.51'),
    au('2026-09-28 08:52', 'U001', '记录提交', '校验记录', '20260928-F001-01', '待提交', '已提交', '一键提交（电子确认）', '10.20.3.51'),
    au('2026-09-28 08:46', '系统', '分析完成', '分析任务', 'T-20260928-002', '分析中', '已完成', '9 次读数全部识别，判定通过', '127.0.0.1'),
    au('2026-09-28 08:41', 'U002', '字段修改', '校验记录', '20260928-F002-01', '无', '低量程砝码盒封条磨损，已更换备用砝码盒', '提交后补充现场情况说明', '10.20.4.18'),
    au('2026-09-28 08:24', 'U002', '记录提交', '校验记录', '20260928-F002-01', '待提交', '已提交', '一键提交（电子确认）', '10.20.4.18'),
    au('2026-09-28 08:20', 'U001', '登录成功', '账号', 'U001', '', '', '首次登录，强制修改口令', '10.20.3.51'),
    au('2026-09-28 08:15', '系统', '分析完成', '分析任务', 'T-20260928-001', '分析中', '已完成', '双量程：高量程 3 次 + 低量程 6 次', '127.0.0.1'),
    au('2026-09-28 08:02', 'U000', '登录成功', '账号', 'U000', '', '', '', '10.20.3.10'),
    au('2026-09-28 02:00', '系统', '备份执行', '系统', '每日自动备份', '', '成功', '备份大小 268MB，保留 30 天', '127.0.0.1'),
    au('2026-09-27 09:31', 'U003', '复核确认', '校验记录', '20260927-F002-01', '已提交', '已复核确认', '电子签名确认', '10.20.3.44'),
    au('2026-09-27 09:06', 'U002', '记录提交', '校验记录', '20260927-F002-01', '待提交', '已提交', '一键提交（电子确认）', '10.20.4.18'),
    au('2026-09-26 08:29', '系统', '分析完成', '分析任务', 'T-20260926-001', '分析中', '已完成', '存在 3 项低置信字段，已标记待核对', '127.0.0.1'),
    au('2026-09-25 09:24', '系统', '分析完成', '分析任务', 'T-20260925-002', '分析中', '待人工处理', '人员卡与登录人员不一致，未生成记录', '127.0.0.1'),
    au('2026-09-25 08:47', 'U000', '账号停用', '账号', 'U004', '启用', '停用', '人员调岗，停用后历史记录保持可查', '10.20.3.10'),
    au('2026-09-25 08:31', 'U000', '账号新增', '账号', 'U004', '王三', '检验人员 / 启用', '新增检验人员账号', '10.20.3.10'),
    au('2026-09-25 08:12', 'U003', '模板参数变更', '记录模板', 'v3', '是否打印测量时间：否', '是否打印测量时间：是', '按客户留档要求恢复打印测量时间行', '10.20.3.44'),
    au('2026-09-24 09:40', 'U003', '复核确认', '校验记录', '20260924-F001-04', '已提交', '已复核确认', '缺次记录，作为异常记录归档', '10.20.3.44'),
    au('2026-09-24 08:48', '系统', '分析完成', '分析任务', 'T-20260924-001', '分析中', '待人工处理', '未识别到人员卡 / 设备卡，未生成正式记录', '127.0.0.1'),
    au('2026-09-23 08:36', '系统', '分析失败', '分析任务', 'T-20260923-001', '分析中', '失败', 'E-2001 视频文件损坏或编码不受支持（HEVC/H.265）', '127.0.0.1'),
    au('2026-09-23 08:30', 'U002', '登录失败', '账号', 'U002', '', '', '口令错误（第 2 次）', '10.20.3.52', '失败'),
    au('2026-09-22 14:20', 'U000', '记录作废', '校验记录', '20260922-F001-06', '已提交', '已作废', '砝码盒编号填错，需重新拍摄校验', '10.20.3.10'),
    au('2026-09-22 09:02', 'U003', '天平档案变更', '天平档案', 'F003', '在用', '停用', '设备送检，停用期间不生成新记录', '10.20.3.44'),
    au('2026-09-21 09:20', 'U003', '复核确认', '校验记录', '20260921-F002-03', '已提交', '已复核确认', '电子签名确认', '10.20.3.44'),
    au('2026-09-20 11:02', '系统', '视频清理', '存储', 'VID_20260620_0830.mp4', '已删除', '释放 24.6MB', '视频配额策略：按最早优先自动清理（FR-1305）', '127.0.0.1'),
    au('2026-09-20 10:04', 'U002', '字段修改', '校验记录', '20260920-F002-04', '20.00103', '20.01503', '识别截图核对：识别值末位误读，按截图更正', '10.20.3.52'),
    au('2026-09-20 09:58', '系统', '容量告警', '存储', '视频配额', '59.4%', '59.6%', '未达 90% 告警阈值', '127.0.0.1'),
    au('2026-09-19 08:44', 'U002', '记录提交', '校验记录', '20260919-F001-07', '待提交', '已提交', '一键提交（电子确认）', '10.20.3.52'),
    au('2026-09-19 08:20', 'U001', '登出', '账号', 'U001', '', '', '30 分钟无操作自动登出', '10.20.3.51'),
    au('2026-09-18 22:14', '系统', '分析告警', '分析任务', 'T-20260918-004', '分析中', '已完成', 'W-2003 识别置信度偏低（0.62），已标记待核对', '127.0.0.1')
  ];

  /* ---------------- 存储配额（FR-1305~FR-1307） ---------------- */
  APP.storage = {
    quota: 200, used: 126.4,
    byDevice: [
      { id: 'F001', count: 61, size: 42.6 },
      { id: 'F002', count: 54, size: 38.1 },
      { id: 'F003', count: 17, size: 12.3 },
      { id: 'F004', count: 11, size: 8.9 },
      { id: '未关联 / 待处理', count: 9, size: 24.5 }
    ],
    retainDays: 158,
    cleanPolicy: '达到配额上限时按"最早优先"自动清理最旧的视频文件；记录、判定结论、识别截图、PDF 与审计日志不受影响（FR-1306）',
    cleaned: [
      { time: '2026-09-20 11:02', file: 'VID_20260620_0830.mp4', size: 24.6, device: 'F001' },
      { time: '2026-08-31 11:00', file: 'VID_20260531_0912.mp4', size: 22.8, device: 'F002' },
      { time: '2026-08-10 11:00', file: 'VID_20260510_0845.mp4', size: 25.3, device: 'F001' }
    ]
  };

  /* ---------------- 运行状态（FR-1308、FR-1311~FR-1313） ---------------- */
  APP.services = [
    { name: 'Web 前端', status: '运行中', detail: 'nginx 1.24 · 静态资源与反向代理' },
    { name: '应用服务', status: '运行中', detail: 'PID 214 · 内存 486MB · 启动于 2026-09-28 02:00' },
    { name: '分析服务', status: '运行中', detail: 'PID 231 · CPU 1.6 核 · 内存 1.2GB（单机串行队列）' },
    { name: '数据库', status: '运行中', detail: 'MySQL 8.0 · 连接数 6/100 · 最近备份 2026-09-28 02:00' },
    { name: '文件存储', status: '运行中', detail: '/data/tianping · 可用 173.6GB' }
  ];
  APP.errors = [
    { time: '2026-09-23 08:36', service: '分析服务', code: 'E-2001', msg: '视频文件损坏或编码不受支持（HEVC/H.265），任务可重试' },
    { time: '2026-09-23 08:30', service: '应用服务', code: 'W-1001', msg: '账号 U002（李二）口令错误 2 次' },
    { time: '2026-09-18 22:14', service: '分析服务', code: 'W-2003', msg: '识别置信度偏低（0.62），已标记待核对，不阻断流程' }
  ];
  APP.backups = [
    { time: '2026-09-28 02:00', type: '自动', size: 268, keep: '30 天', status: '成功', by: '系统' },
    { time: '2026-09-27 02:00', type: '自动', size: 265, keep: '30 天', status: '成功', by: '系统' },
    { time: '2026-09-26 15:40', type: '手动', size: 264, keep: '30 天', status: '成功', by: 'U000' }
  ];
  APP.env = {
    os: 'Ubuntu 22.04 LTS（x86_64）', containers: 'Docker Engine 24.0 + Compose v2',
    ntp: '已同步', ntpSource: 'ntp.lab.local（内网 NTP）', timezone: 'Asia/Shanghai',
    serverTime: '2026-09-28 09:52', health: '正常（/healthz 返回 200）'
  };

  /* ---------------- 记录模板与版本（FR-301~FR-306） ---------------- */
  APP.template = {
    version: 'v3',
    tol: 0.05,
    printTime: true,
    footerNote: '注：出现异常时应在备注栏准确记录，必要时及时报修。',
    footerExtra: '判定依据：|I − L| ≤ 0.05% × L；9 次读数全部在限内、读数稳定、顺序正确、双量程量程切换完整时判为"通过"。',
    fields: [
      { key: 'dept', label: '科室', show: true, locked: true },
      { key: 'uniqueNo', label: '天平唯一号', show: true, locked: true },
      { key: 'max', label: 'Max(g)', show: true, locked: true },
      { key: 'd', label: 'd(mg)', show: true, locked: true },
      { key: 'internalCalType', label: '内部校正方式', show: true, locked: true },
      { key: 'date', label: '校验日期', show: true, locked: true },
      { key: 'cleanliness', label: '清洁', show: true, locked: true },
      { key: 'level', label: '水平调节', show: true, locked: true },
      { key: 'internalCal', label: '内部校正是否通过', show: true, locked: true },
      { key: 'remark', label: '备注', show: true, locked: false },
      { key: 'box', label: '砝码唯一号', show: true, locked: false },
      { key: 'time', label: '测量时间', show: true, locked: false },
      { key: 'detail', label: '判定结论明细', show: true, locked: false }
    ]
  };
  APP.templateVersions = [
    { v: 'v3', time: '2026-09-25 08:12', by: 'U003', summary: '恢复打印"测量时间"行；页脚增加判定依据说明' },
    { v: 'v2', time: '2026-08-14 14:05', by: 'U003', summary: '字段"砝码唯一号"显示名称改为"砝码盒编号"；隐藏"判定结论明细"' },
    { v: 'v1', time: '2026-07-01 09:00', by: 'U000', summary: '系统初始化默认模板（与客户现行《电子天平日常校验记录表》一致）' }
  ];

  /* ---------------- 导出历史（FR-1108） ---------------- */
  APP.exports = [
    {
      time: '2026-09-27 10:20', by: 'U003', type: '批量 PDF', scope: 'F001、F002 / 2026-09-20 ~ 2026-09-26',
      count: 6, files: ['天平校验记录_F001_20260921-20260926.pdf', '天平校验记录_F002_20260920-20260925.pdf']
    },
    { time: '2026-09-25 11:05', by: 'U003', type: '周统计表', scope: 'F001 / 2026-09-15 ~ 2026-09-21', count: 1, files: ['天平校验周统计_F001_20260915-20260921.pdf'] },
    { time: '2026-09-22 09:35', by: 'U003', type: '单条 PDF', scope: '20260920-F002-04', count: 1, files: ['天平校验记录_F002_20260920.pdf'] }
  ];

  /* ---------------- 页面需求标注（需求可追溯） ---------------- */
  APP.REQ_MAP = {
    login: ['FR-101', 'FR-103', 'FR-104', 'FR-105', 'FR-106', 'FR-109', 'FR-110', 'CR-017'],
    overview: ['AC-001 ~ AC-026', 'FR-1007', 'QR-004'],
    workbench: ['FR-407', 'FR-904', 'QR-004'],
    upload: ['FR-401', 'FR-402', 'FR-403', 'FR-404', 'FR-405', 'FR-406', 'FR-407', 'FR-408', 'FR-409', 'FR-410', 'FR-411', 'AC-006', 'AC-022'],
    tasks: ['FR-501', 'FR-502', 'FR-503', 'FR-504', 'FR-505', 'FR-506', 'FR-507', 'FR-508', 'AC-004', 'AC-005', 'AC-017', 'AC-018'],
    review: ['FR-605', 'FR-606', 'FR-612', 'FR-701', 'FR-702', 'FR-703', 'FR-704', 'FR-705', 'FR-706', 'FR-707', 'FR-708', 'FR-709', 'FR-802', 'FR-805', 'FR-806', 'AC-010'],
    records: ['FR-1001', 'FR-1002', 'FR-1007', 'FR-1008', 'FR-812'],
    recordDetail: ['FR-803', 'FR-804', 'FR-810', 'FR-811', 'FR-1009', 'FR-1101', 'FR-1102', 'FR-1103', 'AC-011', 'AC-012', 'AC-013'],
    history: ['FR-1003', 'FR-1004', 'FR-1005', 'FR-1006', 'AC-016'],
    verify: ['FR-901', 'FR-908'],
    verifyDetail: ['FR-902', 'FR-903', 'FR-904', 'FR-906', 'FR-909', 'AC-011'],
    masterdata: ['FR-201', 'FR-202', 'FR-203', 'FR-204', 'FR-205', 'FR-206', 'FR-207', 'FR-208', 'FR-209', 'FR-210', 'FR-211', 'FR-212'],
    template: ['FR-301', 'FR-302', 'FR-303', 'FR-304', 'FR-305', 'FR-306'],
    exportPage: ['FR-1103', 'FR-1104', 'FR-1105', 'FR-1106', 'FR-1107', 'FR-1108', 'FR-905', 'FR-910', 'AC-014', 'AC-015'],
    accounts: ['FR-102', 'FR-103', 'FR-107', 'FR-108', 'FR-109', 'FR-110'],
    audit: ['FR-1301', 'FR-1302', 'FR-1303', 'FR-1304', 'AC-026'],
    system: ['FR-1305', 'FR-1306', 'FR-1307', 'FR-1308', 'FR-1309', 'FR-1310', 'FR-1311', 'FR-1312', 'FR-1313', 'AC-019', 'AC-020'],
    printRecord: ['FR-1101', 'FR-1102', 'FR-1106', 'FR-1110', 'CR-015', 'AC-001'],
    printWeek: ['FR-1105', '附录 A.2', 'AC-015'],
    printBlank: ['FR-108', '附录 A.1', '附录 B']
  };

  APP.PAGE_INDEX = [
    { route: '#/login', title: '登录', roles: '全部', frs: 'FR-101、FR-103、FR-104、FR-106、FR-109、FR-110' },
    { route: '#/overview', title: '演示导览与需求覆盖', roles: '全部', frs: 'AC-001 ~ AC-026 对照' },
    { route: '#/workbench', title: '工作台', roles: '检验人员', frs: 'FR-407、FR-904、QR-004' },
    { route: '#/upload', title: '视频上传', roles: '检验人员', frs: 'FR-401 ~ FR-411' },
    { route: '#/tasks', title: '我的上传与分析队列', roles: '检验人员 / 管理员 / 复核确认', frs: 'FR-501 ~ FR-508' },
    { route: '#/records', title: '记录查询', roles: '全部', frs: 'FR-1001、FR-1002、FR-1007、FR-1008' },
    { route: '#/records/20260928-F001-01', title: '记录详情（已复核确认）', roles: '全部', frs: 'FR-803、FR-810、FR-811、FR-1009' },
    { route: '#/review/20260926-F001-03', title: '记录核对与提交', roles: '检验人员', frs: 'FR-605、FR-606、FR-612、FR-701 ~ FR-709、FR-805、FR-806' },
    { route: '#/history/F001', title: '天平历史汇总与示值明细', roles: '全部', frs: 'FR-1003 ~ FR-1006' },
    { route: '#/verify', title: '待复核工作台', roles: '复核确认人员', frs: 'FR-901' },
    { route: '#/verify/20260928-F002-01', title: '复核详情', roles: '复核确认人员', frs: 'FR-902 ~ FR-906、FR-909' },
    { route: '#/masterdata', title: '天平档案与砝码盒字典', roles: '复核确认 / 管理员', frs: 'FR-201 ~ FR-212' },
    { route: '#/template', title: '记录模板配置', roles: '复核确认 / 管理员', frs: 'FR-301 ~ FR-306' },
    { route: '#/export', title: '导出与打印', roles: '全部', frs: 'FR-1103 ~ FR-1108、FR-905、FR-910' },
    { route: '#/accounts', title: '账号与角色管理', roles: '管理员', frs: 'FR-102、FR-103、FR-107 ~ FR-110' },
    { route: '#/audit', title: '审计日志', roles: '管理员', frs: 'FR-1301 ~ FR-1304' },
    { route: '#/system', title: '存储与运行状态', roles: '管理员', frs: 'FR-1305 ~ FR-1313' },
    { route: '#/print/20260928-F001-01', title: '单日记录表打印预览', roles: '全部', frs: 'FR-1101、FR-1102、FR-1106、FR-1110、CR-015' },
    { route: '#/print/week', title: '周统计表打印预览', roles: '全部', frs: 'FR-1105、附录 A.2' },
    { route: '#/print/blank', title: '空白记录表与卡片清单', roles: '管理员 / 复核确认', frs: 'FR-108、附录 A.1、附录 B' }
  ];

  /* ---------------- 演示路径 ---------------- */
  APP.DEMO_PATHS = [
    {
      role: 'inspector', title: '路径一 · 检验人员：上传 → 分析 → 核对提交', account: 'U001 李一',
      summary: '覆盖日常三步操作：上传、核对并提交、查询导出（QR-004）',
      steps: [
        { t: '登录并强制修改口令', d: 'U001 首次登录触发强制改密（FR-104）', route: '#/login' },
        { t: '上传校验视频', d: '元数据缺失 → 必须人工确认拍摄开始时间；演示断点续传与当日重复上传提示（FR-403~FR-411）', route: '#/upload' },
        { t: '推进分析队列', d: '按 FIFO 串行分析，队列位置与耗时可见；演示失败重试与待人工处理（FR-501~FR-508）', route: '#/tasks' },
        { t: '核对并一键提交', d: '低置信字段高亮 → 修正留痕 → 判定实时重算 → 一键提交（FR-612、FR-701~FR-709、FR-805/806）', route: '#/review/20260926-F001-03' },
        { t: '查询与历史汇总', d: '按天平编号 + 日期段查询，查看示值明细汇总表（FR-1001~FR-1006）', route: '#/history/F001' }
      ]
    },
    {
      role: 'verifier', title: '路径二 · 复核确认人员：复核 → 退回 → 档案与模板', account: 'U003 齐一',
      summary: '覆盖复核不超过两步：查看、确认 / 退回（QR-004）',
      steps: [
        { t: '查看待复核列表', d: '按提交时间、天平编号、检验人员筛选（FR-901）', route: '#/verify' },
        { t: '复核确认或退回', d: '查看视频占位、识别截图、判定依据与修改痕迹；确认即电子签名并锁定（FR-902~FR-906）', route: '#/verify/20260928-F002-01' },
        { t: '维护天平档案与砝码盒字典', d: '砝码标称点自动推荐、限度自动计算、设备二维码内容（FR-201~FR-211）', route: '#/masterdata' },
        { t: '配置记录模板', d: '字段显隐与名称、页脚文字、是否打印测量时间，带实时预览与版本历史（FR-301~FR-306）', route: '#/template' },
        { t: '批量导出与周统计', d: '按天平 + 日期段批量导出，水印规则说明（FR-1103~FR-1108）', route: '#/export' }
      ]
    },
    {
      role: 'admin', title: '路径三 · 管理员：审计 → 容量 → 作废 → 打印', account: 'U000 系统管理员',
      summary: '覆盖管理员的系统管理职责与纸质并轨留档',
      steps: [
        { t: '账号与角色管理', d: '新增 / 停用 / 删除 / 重置口令；停用账号无法登录但历史记录保留（FR-102~FR-109）', route: '#/accounts' },
        { t: '审计日志查询与导出', d: '只读、不可编辑删除，覆盖登录、修改、提交、复核、导出、作废、清理（FR-1301~FR-1304）', route: '#/audit' },
        { t: '存储容量与运行状态', d: '拖动容量滑块到 90% 以上触发告警与自动清理说明（FR-1305~FR-1313）', route: '#/system' },
        { t: '记录作废', d: '填写理由 → 记录只读、标注已作废、不参与统计（FR-809）', route: '#/records/20260922-F001-06' },
        { t: '打印预览与卡片清单', d: '单日记录表 / 周统计表 A4 版式，空白记录表与人员卡、设备卡清单（FR-108、FR-1101~FR-1110）', route: '#/print/20260928-F001-01' }
      ]
    }
  ];

  /* ---------------- 验收用例映射（附录 E） ---------------- */
  APP.AC_CASES = [
    { id: 'AC-001', name: '单量程天平合格记录全流程', expected: '生成记录且判定"通过"，全流程留痕', route: '#/records/20260928-F001-01', page: '记录详情', frs: 'FR-401~411、601~618、701~712、801~813、901~910' },
    { id: 'AC-002', name: '双量程天平合格记录全流程', expected: '3 个标称点归入正确量程，判定"通过"', route: '#/records/20260927-F002-01', page: '记录详情（F002 双量程）', frs: 'FR-603、608、613、703' },
    { id: 'AC-003', name: '不合格样例判定', expected: '判定"不通过"并给出可逐项核对的原因明细', route: '#/records/20260928-F001-02', page: '记录详情（超限）', frs: 'FR-701~706、PR-011' },
    { id: 'AC-004', name: '人员卡与登录人员不一致', expected: '不生成记录并明确提示"人员卡与登录人员不一致"', route: '#/tasks', page: '我的上传与分析队列', frs: 'FR-602、FR-110' },
    { id: 'AC-005', name: '卡面缺失', expected: '不生成正式记录，标记"待人工处理"并提示补拍', route: '#/tasks', page: '我的上传与分析队列', frs: 'FR-604' },
    { id: 'AC-006', name: '拍摄时间缺失', expected: '要求上传者确认拍摄开始时间后方可提交分析', route: '#/upload', page: '视频上传', frs: 'FR-403、FR-404、3.7' },
    { id: 'AC-007', name: '缺次 / 重复 / 顺序错误', expected: '判定"不通过"并说明具体位置与原因', route: '#/records/20260924-F001-04', page: '记录详情（缺次）', frs: 'FR-702~704' },
    { id: 'AC-008', name: '容差边界值', expected: '读数恰好等于上/下限时判为"在限内"（含端点）', route: '#/records/20260928-F001-02', page: '记录详情（I1-3 = 199.9000g）', frs: 'FR-701、附录 C.2' },
    { id: 'AC-009', name: '双量程缺量程切换', expected: '判定"不通过（缺少量程切换）"', route: '#/records/20260925-F002-02', page: '记录详情', frs: 'FR-613、FR-706' },
    { id: 'AC-010', name: '低置信字段修正与留痕', expected: '字段高亮提示，修正留痕（前后值、时间、操作人）', route: '#/review/20260926-F001-03', page: '记录核对与提交', frs: 'FR-612、FR-805、FR-806、PR-012' },
    { id: 'AC-011', name: '提交后备注可改', expected: '修改成功并留痕，复核人员可见', route: '#/records/20260928-F002-01', page: '记录详情（修改痕迹）', frs: 'FR-807' },
    { id: 'AC-012', name: '复核确认后禁改', expected: '修改被拒绝，仅管理员可作废', route: '#/records/20260928-F001-01', page: '记录详情（锁定状态）', frs: 'FR-808' },
    { id: 'AC-013', name: '管理员作废', expected: '记录标注"已作废"、只读、不参与统计', route: '#/records/20260922-F001-06', page: '记录详情（已作废）', frs: 'FR-809' },
    { id: 'AC-014', name: '批量导出 PDF', expected: '按天平 + 日期段生成合并版或分文件版 PDF', route: '#/export', page: '导出与打印', frs: 'FR-1103、FR-1104、FR-1106、PR-013' },
    { id: 'AC-015', name: '周统计导出', expected: '版式与现有 Excel 一致，按实际有记录日期成列', route: '#/print/week', page: '周统计表打印预览', frs: 'FR-1105、附录 A.2' },
    { id: 'AC-016', name: '历史记录汇总与示值明细', expected: '按日期倒序展示、可下钻、异常标注、可导出，不提供图形化曲线', route: '#/history/F001', page: '天平历史汇总', frs: 'FR-1003~FR-1006' },
    { id: 'AC-017', name: '队列顺序与失败重试', expected: '严格按上传顺序完成，不丢任务，重试不产生脏数据', route: '#/tasks', page: '我的上传与分析队列', frs: 'FR-501~FR-504、FR-507' },
    { id: 'AC-018', name: '服务重启恢复', expected: '正在分析任务标记失败可重试，排队任务保留', route: '#/system', page: '存储与运行状态（服务与队列）', frs: 'FR-505、FR-1312、PR-014' },
    { id: 'AC-019', name: '容量上限与自动清理', expected: '90% 告警，达上限按最早优先清理并留痕，记录不受影响', route: '#/system', page: '存储与运行状态（容量告警）', frs: 'FR-1305~FR-1307' },
    { id: 'AC-020', name: '备份与恢复', expected: '账号、记录、审计数据完整恢复', route: '#/system', page: '存储与运行状态（备份与健康检查）', frs: 'FR-1310、3.8' },
    { id: 'AC-021', name: '越权访问', expected: '越权页面入口隐藏，直接访问被拒绝并提示', route: '#/accounts', page: '顶栏切换演示账号后访问越权页', frs: 'FR-105、4.1 权限矩阵' },
    { id: 'AC-022', name: '断点续传', expected: '上传中断后恢复续传，文件校验值一致', route: '#/upload', page: '视频上传（断点续传提示）', frs: 'FR-405、FR-408、PR-007' },
    { id: 'AC-023', name: '性能：单段分析 ≤ 20 分钟', expected: '4 核 / 4GB 服务器分析 5 分钟视频 ≤ 20 分钟', route: '#/system', page: '非界面演示（以测试报告为准）', frs: 'PR-001~PR-003', noUi: true },
    { id: 'AC-024', name: '性能：20 段连续分析', expected: '按序全部完成（允许夜间完成）', route: '#/system', page: '非界面演示（以测试报告为准）', frs: 'PR-004、PR-016', noUi: true },
    { id: 'AC-025', name: '识别准确率统计', expected: '示值 ≥98%、二维码 ≥99%、关键词 ≥95%', route: '#/overview', page: '非界面演示（以测试报告为准）', frs: 'PR-008~PR-010、PR-017', noUi: true },
    { id: 'AC-026', name: '审计日志完整性', expected: '全部事件可查、可导出、不可编辑删除', route: '#/audit', page: '审计日志', frs: 'FR-1301~FR-1304、QR-014' }
  ];

  /* ---------------- 非界面演示的需求说明 ---------------- */
  APP.NON_UI = [
    { key: 'PR-001 ~ PR-018', title: '性能需求', desc: '分析耗时、并发上传、查询响应、识别准确率、导出性能等指标需在客户内网服务器（4 核 / 4GB / 无 GPU）实测；原型仅展示分析队列与运行状态界面，指标以《测试与验收报告》为准。' },
    { key: 'CR-001 ~ CR-018', title: '实现约束', desc: '纯内网离线运行、不依赖 GPU、Windows 与 Linux 双平台容器化交付、B/S 架构、PDF 中文字体本地嵌入、参数配置化等属于实现与交付约束，由部署与验收环节确认。' },
    { key: 'QR-001 ~ QR-015', title: '质量要求', desc: '可复算、可重复、可溯源、可靠性与可审计等质量属性，原型通过"判定实时重算、修改留痕、识别截图、读数时间与审计日志"等界面要素体现设计思路。' }
  ];

})();
