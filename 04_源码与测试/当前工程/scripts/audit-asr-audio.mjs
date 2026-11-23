#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { inspectVideoMetadata } from '../src/services/analyzer.js';
import {
  getSpeechRecognitionStatus,
  recognizeSpeech,
} from '../src/services/speech-recognition.js';

const root = resolve(import.meta.dirname, '..');
const sampleDirectory = resolve(
  process.env.ASR_AUDIT_SAMPLE_DIR
    || join(root, '..', '客户原需求', '测试视频样例'),
);
const outputPath = resolve(
  process.argv[2]
    || join(root, 'verification', 'asr-audio-audit-2026-11-22.json'),
);
const manifestDirectory = join(root, 'samples', 'manifests');
const status = getSpeechRecognitionStatus({
  rootDir: root,
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
});

if (!status.available) {
  throw new Error('内置 ASR 未就绪，无法执行真实音频审计');
}

const manifests = readdirSync(manifestDirectory)
  .filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(join(manifestDirectory, name), 'utf8')))
  .sort((left, right) => left.sourceFile.localeCompare(right.sourceFile));

const results = [];
for (const manifest of manifests) {
  const filePath = join(sampleDirectory, manifest.sourceFile);
  if (!existsSync(filePath)) {
    results.push({
      sourceFile: manifest.sourceFile,
      state: 'sample-missing',
    });
    continue;
  }
  const media = await inspectVideoMetadata({
    filePath,
    config: {
      rootDir: root,
      ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
      ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
    },
  });
  const speech = await recognizeSpeech({
    ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
    filePath,
    media,
    segments: manifest.readouts.map((readout, index) => ({
      sequence: index + 1,
      point: readout.point,
      idx: readout.idx,
      off: readout.off,
    })),
    config: {
      rootDir: root,
      ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
    },
  });
  results.push({
    sourceFile: manifest.sourceFile,
    durationSeconds: media.duration,
    expectedConclusion: manifest.expectedConclusion,
    state: speech.state,
    elapsedMs: speech.elapsedMs,
    engine: speech.engine,
    vad: speech.vad,
    transcript: speech.transcript,
    observed: {
      numberSequences: speech.keywords.weighingNumbers.map((item) => item.sequence),
      fields: Object.fromEntries(
        Object.entries(speech.keywords.fields).map(([field, candidate]) => [
          field,
          candidate
            ? {
              value: candidate.value,
              confidence: candidate.confidence,
              requiresReview: candidate.requiresReview,
              alternatives: candidate.alternatives,
            }
            : null,
        ]),
      ),
      qualitative: speech.keywords.qualitative.map((item) => item.value),
    },
    sequenceReconciliation: {
      matchedCount: speech.sequence.matchedCount,
      conflictCount: speech.sequence.conflictCount,
      unresolvedCount: speech.sequence.unresolvedCount,
      conflicts: speech.sequence.conflicts,
      unresolved: speech.sequence.unresolved,
    },
    manifestHint: manifest.speech || {},
    warnings: speech.warnings,
  });
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  purpose: '客户样例真实音频识别诊断；仅评估辅助能力，不参与核心判定',
  status,
  results,
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

for (const result of results) {
  if (result.state === 'sample-missing') {
    console.log(`${result.sourceFile}: 样例缺失`);
    continue;
  }
  console.log(
    `${result.sourceFile}: ${result.state} · ${result.transcript.length} 条文本 · `
    + `${Math.round(result.elapsedMs)} ms · 编号 ${result.observed.numberSequences.join(',')}`,
  );
}
console.log(outputPath);

