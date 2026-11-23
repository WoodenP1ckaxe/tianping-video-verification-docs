import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { terminateDisplayOcr } from '../src/services/display-ocr.js';
import { analyzeVideo as analyzeTianpingVideo } from '../src/services/analyzer.js';
import { evaluateRecord } from '../src/rules.js';

const root = resolve(import.meta.dirname, '..');
const sampleDirectory = resolve(root, '..', '客户原需求', '测试视频样例');
const manifestDirectory = join(root, 'samples', 'manifests');
const manifests = readdirSync(manifestDirectory)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({
    file: name,
    ...JSON.parse(readFileSync(join(manifestDirectory, name), 'utf8'))
  }));

const devices = [
  {
    id: 'F001',
    uniqueNo: 'DZTP170911C',
    dept: '化学室',
    max: 220,
    d: 0.1,
    ranges: 1,
    range1: { max: 220, d: 0.1 },
    range2: null,
    points: [200, 50, 10],
    pointRange: [1, 1, 1],
    tol: 0.05
  },
  {
    id: 'F002',
    uniqueNo: 'SJS2605002',
    dept: '化学室',
    max: 120,
    d: 0.1,
    ranges: 2,
    range1: { max: 120, d: 0.1 },
    range2: { max: 40, d: 0.01 },
    points: [100, 20, 2],
    pointRange: [1, 2, 2],
    tol: 0.05
  }
];

function sha256OfFile(path) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex').toUpperCase();
}

function normalizeReadouts(readouts) {
  return [...readouts].sort((left, right) => (
    Number(left.point) - Number(right.point)
    || Number(left.idx) - Number(right.idx)
  ));
}

function compareReadouts(expected, actual) {
  const expectedMap = new Map(expected.map((item) => [
    `${item.point}:${item.idx}`,
    item
  ]));
  const actualMap = new Map(actual.map((item) => [
    `${item.point}:${item.idx}`,
    item
  ]));
  const comparisons = [];
  let valueMatches = 0;
  let stableMatches = 0;
  let rangeMatches = 0;
  let offsetWithinFiveSeconds = 0;
  for (const [key, expectedItem] of expectedMap) {
    const actualItem = actualMap.get(key);
    const valueMatch = actualItem
      && Number.isFinite(Number(actualItem.value))
      && Math.abs(Number(actualItem.value) - Number(expectedItem.value)) <= 0.00001;
    const stableMatch = actualItem
      && Boolean(actualItem.stable) === Boolean(expectedItem.stable);
    const rangeMatch = actualItem
      && Number(actualItem.range) === Number(expectedItem.range);
    const offsetDelta = actualItem
      ? Math.abs(Number(actualItem.off) - Number(expectedItem.off))
      : null;
    if (valueMatch) valueMatches += 1;
    if (stableMatch) stableMatches += 1;
    if (rangeMatch) rangeMatches += 1;
    if (offsetDelta !== null && offsetDelta <= 5) offsetWithinFiveSeconds += 1;
    comparisons.push({
      key,
      expected: {
        value: expectedItem.value,
        off: expectedItem.off,
        stable: expectedItem.stable,
        range: expectedItem.range
      },
      actual: actualItem ? {
        value: actualItem.value,
        off: actualItem.off,
        stable: actualItem.stable,
        range: actualItem.range,
        conf: actualItem.conf,
        method: actualItem.ocr?.method || null
      } : null,
      valueMatch: Boolean(valueMatch),
      stableMatch: Boolean(stableMatch),
      rangeMatch: Boolean(rangeMatch),
      offsetDelta
    });
  }
  return {
    total: expectedMap.size,
    valueMatches,
    stableMatches,
    rangeMatches,
    offsetWithinFiveSeconds,
    comparisons
  };
}

function stableSignature(result) {
  return JSON.stringify({
    deviceId: result.deviceId,
    sequence: result.recognition.sequence,
    readouts: normalizeReadouts(result.readouts).map((item) => ({
      point: item.point,
      idx: item.idx,
      value: item.value,
      off: item.off,
      stable: item.stable,
      range: item.range
    })),
    rangeSwitch: result.rangeSwitch,
    rangeTransition: result.rangeTransition
  });
}

const results = [];
const rootTemp = mkdtempSync(join(tmpdir(), 'tianping-domain-audit-'));
try {
  for (const manifest of manifests) {
    const filePath = join(sampleDirectory, manifest.sourceFile);
    if (!existsSync(filePath)) {
      results.push({
        sample: manifest.sourceFile,
        skipped: '样例视频不存在'
      });
      continue;
    }
    const actualSha = sha256OfFile(filePath);
    const runs = [];
    for (let round = 1; round <= 2; round += 1) {
      const runDirectory = join(rootTemp, `${actualSha}-${round}`);
      const started = performance.now();
      const result = await analyzeTianpingVideo({
        filePath,
        sha256: actualSha,
        startedAt: '2026-09-28 08:30',
        uploadedBy: 'U001',
        devices,
        recordId: `AUDIT-${manifest.deviceId}-${round}`,
        config: {
          dataDir: runDirectory,
          analysisTimeoutMs: 120_000
        }
      });
      const elapsedMs = performance.now() - started;
      const device = devices.find((item) => item.id === result.deviceId);
      const evaluation = evaluateRecord({
        readouts: result.readouts,
        rangeSwitch: result.rangeSwitch,
        rangeTransition: result.rangeTransition,
        recognition: result.recognition
      }, device, device.tol);
      const screenshotDirectory = join(
        runDirectory,
        'screenshots',
        `AUDIT-${manifest.deviceId}-${round}`
      );
      runs.push({
        round,
        elapsedMs,
        deviceId: result.deviceId,
        conclusion: evaluation.conclusion,
        reasons: evaluation.reasons.map((reason) => reason.code),
        readouts: normalizeReadouts(result.readouts),
        recognition: result.recognition,
        rangeSwitch: result.rangeSwitch,
        rangeTransition: result.rangeTransition,
        personCard: result.personCard,
        deviceCard: result.deviceCard,
        deterministicSignature: stableSignature(result),
        screenshotCount: existsSync(screenshotDirectory)
          ? readdirSync(screenshotDirectory).length
          : 0
      });
    }
    results.push({
      sample: manifest.sourceFile,
      manifestFile: manifest.file,
      manifestDeviceId: manifest.deviceId,
      manifestDeviceCard: manifest.deviceCard,
      manifestConclusion: manifest.expectedConclusion,
      actualSha,
      manifestFilenameMatches: `${actualSha}.json`.toUpperCase()
        === manifest.file.toUpperCase(),
      manifestIdentityConsistent:
        !manifest.deviceCard?.code
        || String(manifest.deviceCard.code) === String(manifest.deviceId)
        || String(manifest.deviceCard.code) === 'SJS2605002'
          && String(manifest.deviceId) === 'F002',
      repeatable: runs[0].deterministicSignature === runs[1].deterministicSignature,
      run1: runs[0],
      run2: runs[1],
      comparisonRound1: compareReadouts(manifest.readouts, runs[0].readouts),
      comparisonRound2: compareReadouts(manifest.readouts, runs[1].readouts)
    });
  }
} finally {
  await terminateDisplayOcr();
  rmSync(rootTemp, { recursive: true, force: true });
}

const output = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  samples: results
};
const outputPath = join(root, 'verification', 'domain-audit-20261108-results.json');
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  generatedAt: output.generatedAt,
  node: output.node,
  outputPath,
  samples: results.map((sample) => ({
    sample: sample.sample,
    manifestDeviceId: sample.manifestDeviceId,
    actualDeviceId: sample.run1?.deviceId,
    manifestConclusion: sample.manifestConclusion,
    actualConclusionRound1: sample.run1?.conclusion,
    actualConclusionRound2: sample.run2?.conclusion,
    actualShaMatchesManifestName: sample.manifestFilenameMatches,
    manifestIdentityConsistent: sample.manifestIdentityConsistent,
    repeatable: sample.repeatable,
    elapsedMsRun1: sample.run1?.elapsedMs,
    elapsedMsRun2: sample.run2?.elapsedMs,
    reasonsRound1: sample.run1?.reasons,
    screenshots: {
      round1: sample.run1?.screenshotCount,
      round2: sample.run2?.screenshotCount
    },
    round1: sample.comparisonRound1
      ? {
        total: sample.comparisonRound1.total,
        valueMatches: sample.comparisonRound1.valueMatches,
        stableMatches: sample.comparisonRound1.stableMatches,
        rangeMatches: sample.comparisonRound1.rangeMatches,
        offsetWithinFiveSeconds: sample.comparisonRound1.offsetWithinFiveSeconds,
        mismatches: sample.comparisonRound1.comparisons
          .filter((item) => !item.valueMatch)
          .map((item) => ({
            key: item.key,
            expected: item.expected.value,
            actual: item.actual?.value ?? null
          }))
      }
      : null,
    round2: sample.comparisonRound2
      ? {
        total: sample.comparisonRound2.total,
        valueMatches: sample.comparisonRound2.valueMatches,
        stableMatches: sample.comparisonRound2.stableMatches,
        rangeMatches: sample.comparisonRound2.rangeMatches,
        offsetWithinFiveSeconds: sample.comparisonRound2.offsetWithinFiveSeconds
      }
      : null
  }))
}, null, 2));
