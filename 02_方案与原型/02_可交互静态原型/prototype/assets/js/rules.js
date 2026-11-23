/* ==========================================================================
   rules.js — 判定规则（FR-701 ~ FR-712、附录 C）
   限度 = (1 ± 容差系数) × L，小数位按该量程精度 d 对齐；
   判定结论仅有"通过 / 不通过"，且必须可复算（同一输入结果唯一）。
   ========================================================================== */
(function () {
  'use strict';

  var APP = window.APP = window.APP || {};
  var R = {};

  /** 由分度值 d(mg) 推出示值应保留的小数位：0.1mg→4 位，0.01mg→5 位，1mg→3 位 */
  function decimalsFromD(dmg) {
    var g = dmg / 1000;
    var dec = Math.ceil(-Math.log10(g) - 1e-9);
    return Math.max(0, Math.min(8, dec));
  }

  function rnd(v, dec) {
    var f = Math.pow(10, dec);
    return Math.round(v * f) / f;
  }

  function fmt(v, dec) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Number(v).toFixed(dec);
  }

  function devStr(v, L, dec) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var dv = rnd(v - L, dec);
    return (dv > 0 ? '+' : '') + dv.toFixed(dec);
  }

  /** 限度区间（含端点） */
  function limit(L, dec, tolPct) {
    var t = (tolPct === null || tolPct === undefined ? APP.TOL_DEFAULT : tolPct) / 100;
    return { lo: rnd(L * (1 - t), dec), hi: rnd(L * (1 + t), dec) };
  }

  function limitText(L, dec, tolPct) {
    var l = limit(L, dec, tolPct);
    return fmt(l.lo, dec) + 'g~' + fmt(l.hi, dec) + 'g';
  }

  /** 该称重所属量程（单量程恒为 1；双量程第 1 个标称点在高量程） */
  function rangeOf(device, point, ro) {
    if (device.ranges !== 2) return 1;
    if (ro && ro.range) return ro.range;
    if (device.pointRange && device.pointRange[point]) return device.pointRange[point];
    return point === 0 ? 1 : 2;
  }

  function decimalsOf(device, range) {
    var d = (range === 2 && device.range2) ? device.range2.d : device.range1.d;
    return decimalsFromD(d);
  }

  function rangeLabel(device, range) {
    if (device.ranges !== 2) return '单量程';
    return range === 2 ? '低量程' : '高量程';
  }

  function readoutKey(ro) { return 'I' + (ro.point + 1) + '-' + ro.idx; }

  /**
   * 逐项 + 整体判定（FR-701 ~ FR-707、FR-709）
   * 返回 { conclusion, pass, reasons[], items[], groups[], tol }
   */
  function evaluate(record, device, tolPct) {
    var tol = (tolPct === null || tolPct === undefined) ? (device.tol || APP.TOL_DEFAULT) : tolPct;
    var ros = (record.readouts || []).slice();
    var groups = [[], [], []];
    var items = [];
    var reasons = [];
    var seq = [];

    ros.forEach(function (ro) {
      var pi = ro.point;
      groups[pi].push(ro);
      seq.push(pi);

      var range = rangeOf(device, pi, ro);
      var dec = decimalsOf(device, range);
      var L = device.points[pi];
      var lim = limit(L, dec, tol);
      var v = (ro.value === null || ro.value === undefined) ? null : Number(ro.value);
      var inLimit = v !== null && v >= lim.lo - 1e-9 && v <= lim.hi + 1e-9;

      items.push({
        key: readoutKey(ro), ro: ro, point: pi, idx: ro.idx, L: L, dec: dec, lim: lim,
        range: range, rangeLabel: rangeLabel(device, range),
        value: v, dev: v === null ? null : rnd(v - L, dec),
        inLimit: inLimit, missing: v === null, stable: ro.stable !== false, conf: ro.conf
      });
    });

    /* 缺次 / 重复（FR-702、FR-704）：null 表示该次称重未识别到有效读数 */
    groups.forEach(function (g, pi) {
      var L = device.points[pi];
      var missingList = g.filter(function (r) { return r.value === null || r.value === undefined; });
      var valid = g.length - missingList.length;
      if (valid < 3) {
        var missKeys = missingList.map(function (r) { return readoutKey(r); });
        reasons.push({
          code: 'MISSING',
          label: '缺次',
          detail: 'L' + (pi + 1) + '（' + L + 'g）仅识别到 ' + valid + ' 次有效称重，应为 3 次' +
            (missKeys.length ? '（' + missKeys.join('、') + ' 未识别到有效读数）' : '')
        });
      } else if (g.length > 3) {
        reasons.push({
          code: 'DUPLICATE',
          label: '重复称重',
          detail: 'L' + (pi + 1) + '（' + L + 'g）识别到 ' + g.length + ' 次称重，多于要求的 3 次'
        });
      }
    });

    /* 顺序（FR-703） */
    var expected = [0, 0, 0, 1, 1, 1, 2, 2, 2];
    var orderLabel = seq.map(function (p) { return 'L' + (p + 1); }).join(' → ');
    if (seq.length === 9 && seq.join(',') !== expected.join(',')) {
      reasons.push({
        code: 'ORDER',
        label: '顺序错误',
        detail: '实际称重顺序为 ' + orderLabel + '，与要求的 L1×3 → L2×3 → L3×3 不一致'
      });
    }

    /* 双量程量程切换（FR-706） */
    if (device.ranges === 2 && record.rangeSwitch === false) {
      reasons.push({
        code: 'NO_RANGE_SWITCH',
        label: '缺少量程切换',
        detail: '双量程天平未识别到量程切换过程段（高量程 1 个标称点 3 次 + 低量程 2 个标称点 6 次）'
      });
    }

    /* 逐项超限与不稳定（FR-701、FR-705） */
    items.forEach(function (it) {
      if (it.missing) return;
      if (!it.inLimit) {
        reasons.push({
          code: 'OVER_LIMIT',
          label: '示值超限',
          detail: it.key + ' 示值 ' + fmt(it.value, it.dec) + 'g 超出限度 ' +
            fmt(it.lim.lo, it.dec) + 'g~' + fmt(it.lim.hi, it.dec) + 'g（偏差 ' + devStr(it.value, it.L, it.dec) + 'g）'
        });
      }
      if (it.stable === false) {
        reasons.push({
          code: 'UNSTABLE',
          label: '读数不稳定',
          detail: it.key + ' 未找到连续 ≥3s 且变化不超过 1 个分度值 d 的稳定平台段（FR-609）'
        });
      }
    });

    var pass = reasons.length === 0;
    return {
      conclusion: pass ? '通过' : '不通过',
      pass: pass,
      reasons: reasons,
      items: items,
      groups: groups,
      tol: tol,
      seqLabel: orderLabel
    };
  }

  /** 单条记录结论（仅"通过 / 不通过"两种取值，FR-707） */
  function conclusionOf(record, device) {
    return evaluate(record, device).conclusion;
  }

  /** 判定依据一行说明（用于记录详情与打印页，FR-710） */
  function basisText(record, device, ev) {
    var e = ev || evaluate(record, device);
    if (e.pass) {
      return '9 次读数全部落在 (1±' + e.tol + '%)×L 限度内（含端点），每只砝码各 3 次齐全、顺序正确、读数稳定' +
        (device.ranges === 2 ? '、且识别到量程切换过程段' : '') + '，判定为"通过"。';
    }
    return '共 ' + e.reasons.length + ' 项不满足，判定为"不通过"：' +
      e.reasons.map(function (r) { return r.label; }).join('、') + '。';
  }

  /** 低置信字段（FR-612 / PR-012）：置信度低于阈值必须标记待核对，不得静默入库 */
  var CONF_THRESHOLD = 0.9;
  function isLowConf(conf) { return conf === null || conf === undefined || conf < CONF_THRESHOLD; }

  function lowConfItems(record, device) {
    var ev = evaluate(record, device);
    return ev.items.filter(function (it) { return isLowConf(it.conf); });
  }

  function lowConfFields(record) {
    var out = [];
    ['cleanliness', 'level', 'internalCal'].forEach(function (k) {
      var sp = record.speech && record.speech[k];
      if (sp && isLowConf(sp.conf)) {
        out.push({ key: k, label: k === 'cleanliness' ? '清洁' : k === 'level' ? '水平调节' : '内部校正是否通过', conf: sp.conf });
      }
    });
    return out;
  }

  /** 提交前完整性校验（FR-802 / FR-805） */
  function submitBlockers(record, device) {
    var out = [];
    if (!record.box) out.push('砝码盒编号未填写（FR-208）');
    if (!record.cleanliness) out.push('"清洁"未确认');
    if (!record.level) out.push('"水平调节"未确认');
    if (!record.internalCal) out.push('"内部校正是否通过"未确认');
    var low = lowConfItems(record, device).filter(function (i) { return !isChecked(record, 'RO:' + i.key); });
    if (low.length) {
      out.push('存在 ' + low.length + ' 个低置信读数未核对：' + low.map(function (i) { return i.key; }).join('、') + '（FR-612）');
    }
    var lowF = lowConfFields(record).filter(function (i) { return !isChecked(record, 'SP:' + i.key); });
    if (lowF.length) {
      out.push('存在低置信口述问答未核对：' + lowF.map(function (i) { return i.label; }).join('、'));
    }
    var ev = evaluate(record, device);
    if (ev.items.some(function (i) { return i.missing; })) {
      out.push('存在缺失读数（缺次），请核对后补充或按异常记录提交');
    }
    return out;
  }

  /** 限定符：把待核对项视为已核对（原型中由使用者点击"标记已核对"完成） */
  function markChecked(record, key) {
    if (!record._checked) record._checked = {};
    record._checked[key] = true;
  }
  function isChecked(record, key) { return !!(record._checked && record._checked[key]); }

  /** 该天平推荐砝码标称点（FR-203）：单量程 220g→200/50/10；双量程 120/40g→100/20/2 */
  function niceBelow(v) {
    var decades = [1, 2, 5];
    var best = 1;
    for (var e = -2; e <= 5; e++) {
      decades.forEach(function (m) {
        var n = m * Math.pow(10, e);
        if (n <= v + 1e-9 && n > best) best = n;
      });
    }
    return best === 1 ? v : best;
  }

  function recommendPoints(device) {
    var r1 = device.range1 ? device.range1.max : device.max;
    if (device.ranges === 2 && device.range2) {
      var L1 = niceBelow(r1 * 5 / 6);
      var L2 = niceBelow(device.range2.max / 2);
      var L3 = niceBelow(device.range2.max / 20);
      return [L1, L2, L3];
    }
    var a = niceBelow(r1 * 10 / 11);
    return [a, niceBelow(a / 4), niceBelow(a / 20)];
  }

  R.decimalsFromD = decimalsFromD;
  R.decimalsOf = decimalsOf;
  R.rangeOf = rangeOf;
  R.rangeLabel = rangeLabel;
  R.limit = limit;
  R.limitText = limitText;
  R.fmt = fmt;
  R.rnd = rnd;
  R.devStr = devStr;
  R.readoutKey = readoutKey;
  R.evaluate = evaluate;
  R.conclusionOf = conclusionOf;
  R.basisText = basisText;
  R.CONF_THRESHOLD = CONF_THRESHOLD;
  R.isLowConf = isLowConf;
  R.lowConfItems = lowConfItems;
  R.lowConfFields = lowConfFields;
  R.submitBlockers = submitBlockers;
  R.markChecked = markChecked;
  R.isChecked = isChecked;
  R.recommendPoints = recommendPoints;

  APP.Rules = R;

})();
