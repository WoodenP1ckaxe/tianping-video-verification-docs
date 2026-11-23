import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSpeechKeywords,
  getSpeechRecognitionStatus,
  parseWhisperPayload,
  reconcileSpeechNumbers,
} from '../src/services/speech-recognition.js';
import {
  ASR_ASSETS,
  WHISPER_CPP_VERSION,
  WHISPER_MODEL_NAME,
  WHISPER_VAD_MODEL_NAME,
} from '../scripts/asr-assets.js';

test('Whisper JSON 保留文本、时间和真实 token 置信度', () => {
  const parsed = parseWhisperPayload({
    transcription: [{
      text: ' 第一次称量 ',
      offsets: { from: 1250, to: 2800 },
      tokens: [{ p: 0.9 }, { p: 0.81 }, { p: 0.99 }],
    }],
  }, { start: 10, end: 14 });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].text, '第一次称量');
  assert.equal(parsed[0].startMs, 11250);
  assert.equal(parsed[0].endMs, 12800);
  assert.ok(parsed[0].confidence > 0.89 && parsed[0].confidence < 0.91);
});

test('中文数字、口述问答和异常描述映射为受控候选', () => {
  const keywords = extractSpeechKeywords([
    {
      text: '这是第一次称量，清洁已完成，水平调节是，内部校正通过，无异常',
      startMs: 10_000,
      endMs: 16_000,
      confidence: 0.93,
    },
    {
      text: '第二次称重，重新称',
      startMs: 32_000,
      endMs: 35_000,
      confidence: 0.88,
    },
  ], { confidenceThreshold: 0.8 });
  assert.deepEqual(keywords.weighingNumbers.map((item) => item.sequence), [1, 2]);
  assert.equal(keywords.fields.cleanliness.value, '是');
  assert.equal(keywords.fields.level.value, '是');
  assert.equal(keywords.fields.internalCal.value, '是');
  assert.ok(keywords.qualitative.some((item) => item.value === '重新称'));
  assert.ok(keywords.qualitative.some((item) => item.value === '无异常'));
});

test('低置信与否定表达进入待核对候选', () => {
  const keywords = extractSpeechKeywords([{
    text: '第一次称量，清洁不适用，内部校正不通过',
    startMs: 1000,
    endMs: 4000,
    confidence: 0.62,
  }], { confidenceThreshold: 0.8 });
  assert.equal(keywords.fields.cleanliness.value, 'NA');
  assert.equal(keywords.fields.internalCal.value, '否');
  assert.equal(keywords.weighingNumbers[0].requiresReview, true);
  assert.equal(keywords.fields.internalCal.requiresReview, true);
});

test('问句中的“是否”和单独“无”不会误判否定答案', () => {
  const keywords = extractSpeechKeywords([
    {
      text: '内部校正是否通过，是',
      startMs: 1000,
      endMs: 3000,
      confidence: 0.92,
    },
    {
      text: '无',
      startMs: 4000,
      endMs: 4500,
      confidence: 0.85,
    },
  ], { confidenceThreshold: 0.8 });
  assert.equal(keywords.fields.internalCal.value, '是');
  assert.ok(keywords.qualitative.some((item) => item.value === '无'));
});

test('语音编号与稳定段冲突时保留两种编号且以稳定段为准', () => {
  const reconciled = reconcileSpeechNumbers([
    {
      sequence: 2,
      spoken: '第二次',
      startMs: 10_000,
      endMs: 12_000,
      confidence: 0.9,
      requiresReview: false,
    },
  ], [
    { sequence: 1, point: 0, idx: 1, off: 11 },
    { sequence: 2, point: 0, idx: 2, off: 40 },
  ]);
  assert.equal(reconciled.conflictCount, 1);
  assert.equal(reconciled.weighingNumbers[0].sequence, 2);
  assert.equal(reconciled.weighingNumbers[0].stableSequence, 1);
  assert.equal(reconciled.weighingNumbers[0].state, 'conflict');
  assert.equal(reconciled.requiresReview, true);
});

test('客户按量程重复说第一至第三次时按组内序号匹配', () => {
  const reconciled = reconcileSpeechNumbers([
    {
      sequence: 2,
      spoken: '第二次',
      startMs: 40_000,
      endMs: 42_000,
      confidence: 0.9,
      requiresReview: false,
    },
  ], [
    { sequence: 5, point: 1, idx: 2, off: 41 },
  ]);
  assert.equal(reconciled.conflictCount, 0);
  assert.equal(reconciled.matchedCount, 1);
  assert.equal(reconciled.weighingNumbers[0].matchScope, 'point');
  assert.equal(reconciled.weighingNumbers[0].state, 'matched');
});

test('未部署模型时状态明确为不可用而非伪造可用', () => {
  const status = getSpeechRecognitionStatus({
    rootDir: import.meta.dirname,
    asrBinaryPath: 'missing-whisper-cli',
    asrModelPath: 'missing-model.bin',
    ffmpegPath: 'missing-ffmpeg',
  });
  assert.equal(status.supported, true);
  assert.equal(status.available, false);
  assert.equal(status.audioPolicy.includes('deleted'), true);
});

test('最终安装包使用固定版本的 ASR 二进制、模型和许可证', () => {
  assert.equal(WHISPER_CPP_VERSION, '1.9.2');
  assert.equal(WHISPER_MODEL_NAME, 'ggml-base-q5_1.bin');
  assert.deepEqual(ASR_ASSETS.map((asset) => asset.name), [
    'whisper-bin-x64.zip',
    'whisper-bin-ubuntu-x64.tar.gz',
    'ggml-base-q5_1.bin',
    WHISPER_VAD_MODEL_NAME,
    'WHISPER-CPP-LICENSE.txt',
    'WHISPER-MODEL-LICENSE.txt',
    'SILERO-VAD-LICENSE.txt',
  ]);
  assert.ok(ASR_ASSETS.every((asset) => /^[a-f0-9]{64}$/.test(asset.sha256)));
  assert.ok(ASR_ASSETS.every((asset) => asset.url.startsWith('https://')));
});

test('本机内置 ASR 文件可直接进入 ready 状态', (t) => {
  const status = getSpeechRecognitionStatus();
  if (!status.available) {
    t.skip('当前工作区尚未执行 npm run prepare:asr');
    return;
  }
  assert.equal(status.state, 'ready');
  assert.equal(status.modelName, WHISPER_MODEL_NAME);
  assert.equal(status.vadModelName, WHISPER_VAD_MODEL_NAME);
  assert.match(status.binaryName, /^whisper-cli(?:\.exe)?$/);
  assert.equal(status.threads, 2);
  assert.equal(status.vadThreshold, 0.5);
});

