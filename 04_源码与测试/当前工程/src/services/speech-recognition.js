import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_LANGUAGE = 'zh';
const DEFAULT_THREADS = 2;
const DEFAULT_MIN_CONFIDENCE = 0.8;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_VAD_THRESHOLD = 0.5;
const VAD_MODEL_NAME = 'ggml-silero-v6.2.0.bin';

const CHINESE_NUMBERS = Object.freeze({
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
});

const FIELD_TERMS = Object.freeze({
  cleanliness: ['清洁', '清理', '干净'],
  level: ['水平调节', '水平', '调平'],
  internalCal: ['内部校正', '内部校准', '内校'],
});

const FIELD_LABELS = Object.freeze({
  cleanliness: '清洁',
  level: '水平调节',
  internalCal: '内部校正是否通过',
});

function findExecutable(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const names = [candidate];
    if (!isAbsolute(candidate) && !candidate.includes('/') && !candidate.includes('\\')) {
      names.length = 0;
      const extensions = process.platform === 'win32'
        ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
        : [''];
      for (const directory of (process.env.PATH || '').split(delimiter)) {
        if (!directory) continue;
        for (const extension of extensions) {
          names.push(join(directory, candidate + extension));
        }
      }
    }
    for (const name of names) {
      try {
        accessSync(name, constants.X_OK);
        return name;
      } catch {
        if (existsSync(name) && !name.toLowerCase().endsWith('.ps1')) return name;
      }
    }
  }
  return null;
}

function findModel(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = resolve(candidate);
    try {
      if (statSync(resolved).isFile()) return resolved;
    } catch {
      // Keep trying conventional locations.
    }
  }
  return null;
}

function projectRoot(config) {
  return resolve(config.rootDir || join(import.meta.dirname, '..', '..'));
}

function binaryCandidates(config) {
  const root = projectRoot(config);
  const executable = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  return [
    config.asrBinaryPath,
    process.env.ASR_BINARY_PATH,
    join(root, 'asr', 'bin', executable),
    join(root, 'asr', 'bin', process.platform, executable),
    process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli',
    process.platform === 'win32' ? 'whisper.exe' : 'whisper',
  ];
}

function modelCandidates(config) {
  const root = projectRoot(config);
  return [
    config.asrModelPath,
    process.env.ASR_MODEL_PATH,
    join(root, 'asr', 'models', 'ggml-base-q5_1.bin'),
    join(root, 'asr', 'models', 'ggml-base-q5_0.bin'),
    join(root, 'asr', 'models', 'ggml-base.bin'),
    join(root, 'asr', 'models', 'ggml-small-q5_1.bin'),
  ];
}

function vadModelCandidates(config) {
  const root = projectRoot(config);
  return [
    config.asrVadModelPath,
    process.env.ASR_VAD_MODEL_PATH,
    join(root, 'asr', 'models', VAD_MODEL_NAME),
  ];
}

function floatSetting(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function integerSetting(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function enabledSetting(config) {
  if (config.asrEnabled !== undefined) return config.asrEnabled !== false;
  return !['0', 'false', 'no', 'off'].includes(
    String(process.env.ASR_ENABLED ?? 'true').toLowerCase(),
  );
}

export function getSpeechRecognitionStatus(config = {}) {
  const enabled = enabledSetting(config);
  const binary = findExecutable(binaryCandidates(config));
  const model = findModel(modelCandidates(config));
  const vadModel = findModel(vadModelCandidates(config));
  const ffmpeg = findExecutable([
    config.ffmpegPath,
    process.env.FFMPEG_PATH,
    'ffmpeg',
  ]);
  const available = enabled && Boolean(binary && model && vadModel && ffmpeg);
  return {
    engine: 'whisper.cpp',
    supported: true,
    enabled,
    available,
    state: !enabled
      ? 'disabled'
      : available
        ? 'ready'
        : 'unavailable',
    binaryPresent: Boolean(binary),
    modelPresent: Boolean(model),
    vadModelPresent: Boolean(vadModel),
    ffmpegPresent: Boolean(ffmpeg),
    binaryName: binary ? basename(binary) : null,
    modelName: model ? basename(model) : null,
    vadModelName: vadModel ? basename(vadModel) : null,
    language: config.asrLanguage || process.env.ASR_LANGUAGE || DEFAULT_LANGUAGE,
    threads: integerSetting(
      config.asrThreads ?? process.env.ASR_THREADS,
      DEFAULT_THREADS,
      1,
      8,
    ),
    confidenceThreshold: floatSetting(
      config.asrMinConfidence ?? process.env.ASR_MIN_CONFIDENCE,
      DEFAULT_MIN_CONFIDENCE,
      0.01,
      1,
    ),
    vadThreshold: floatSetting(
      config.asrVadThreshold ?? process.env.ASR_VAD_THRESHOLD,
      DEFAULT_VAD_THRESHOLD,
      0.01,
      0.99,
    ),
    audioPolicy: 'temporary-video-derived-pcm-deleted-after-inference',
    recommendedProfile: {
      engine: 'whisper.cpp',
      model: 'ggml-base-q5_1.bin',
      language: 'zh',
      threads: 2,
      precision: 'q5_1',
      vad: 'silero-v6.2.0',
    },
  };
}

function run(command, args, timeoutMs, spawnOptions = {}) {
  return new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;
    let child;
    try {
      child = spawn(command, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...spawnOptions,
      });
    } catch (error) {
      resolvePromise({ code: -1, stdout, stderr: error.message });
      return;
    }

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };
    timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // The child may already have exited.
      }
      finish({ code: -1, stdout, stderr: `${stderr}\nASR 处理超时`, timedOut: true });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 2_000_000) stdout = stdout.slice(-1_500_000);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 500_000) stderr = stderr.slice(-400_000);
    });
    child.on('error', (error) => {
      finish({ code: -1, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on('close', (code) => finish({ code, stdout, stderr }));
  });
}

function extractAudio({
  ffmpegPath,
  filePath,
  outputPath,
  timeoutMs,
}) {
  return run(
    ffmpegPath,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      filePath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'pcm_s16le',
      '-y',
      outputPath,
    ],
    Math.min(timeoutMs, 5 * 60_000),
  );
}

function tokenConfidence(tokens) {
  const probabilities = (Array.isArray(tokens) ? tokens : [])
    .map((token) => Number(token?.p ?? token?.probability))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 1);
  if (!probabilities.length) return null;
  const logMean = probabilities.reduce((total, value) => total + Math.log(value), 0)
    / probabilities.length;
  return Math.round(Math.exp(logMean) * 10_000) / 10_000;
}

function cleanText(text) {
  return String(text || '')
    .replace(/\[(?:BLANK_AUDIO|PBLANK_AUDIO|MUSIC|NOISE)\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseWhisperPayload(payload, window = { start: 0, end: 0 }) {
  const source = Array.isArray(payload?.transcription)
    ? payload.transcription
    : (Array.isArray(payload?.segments) ? payload.segments : []);
  const startOffsetMs = Math.max(0, Number(window.start) || 0) * 1000;
  const endOffsetMs = Math.max(0, Number(window.end) || 0) * 1000;
  return source
    .map((segment) => {
      const text = cleanText(segment?.text);
      if (!text) return null;
      const localStart = Number(
        segment?.offsets?.from
        ?? segment?.start * 1000
        ?? 0,
      );
      const localEnd = Number(
        segment?.offsets?.to
        ?? segment?.end * 1000
        ?? localStart,
      );
      return {
        text,
        startMs: Math.max(
          startOffsetMs,
          Math.round(startOffsetMs + (Number.isFinite(localStart) ? localStart : 0)),
        ),
        endMs: Math.min(
          endOffsetMs || Number.POSITIVE_INFINITY,
          Math.round(startOffsetMs + (Number.isFinite(localEnd) ? localEnd : localStart)),
        ),
        confidence: tokenConfidence(segment?.tokens),
      };
    })
    .filter(Boolean);
}

async function transcribeAudio({
  binaryArgument,
  modelArgument,
  vadModelArgument,
  vadThreshold,
  language,
  threads,
  wavPath,
  outputPrefix,
  timeoutMs,
  asrRoot,
}) {
  const result = await run(
    binaryArgument,
    [
      '-m',
      modelArgument,
      '-vm',
      vadModelArgument,
      '--vad',
      '--vad-threshold',
      String(vadThreshold),
      '-f',
      wavPath,
      '-l',
      language,
      '-t',
      String(threads),
      '-np',
      '-ojf',
      '-of',
      outputPrefix,
    ],
    timeoutMs,
    { cwd: asrRoot },
  );
  if (result.code !== 0) {
    throw new Error(String(result.stderr || '本地语音模型运行失败').slice(-500));
  }
  const jsonPath = `${outputPrefix}.json`;
  if (!existsSync(jsonPath)) {
    throw new Error('本地语音模型未生成识别结果');
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch {
    throw new Error('本地语音识别结果不是有效 JSON');
  }
  return parseWhisperPayload(payload, { start: 0, end: 0 });
}

function normalizeSpeechText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s，。！？、,.!?;；:："'“”‘’()（）[\]【】_-]+/g, '');
}

function normalizeNumber(value) {
  return CHINESE_NUMBERS[value] || Number(value);
}

function lowConfidence(confidence, threshold) {
  return !Number.isFinite(Number(confidence)) || Number(confidence) < threshold;
}

function fieldAnswer(field, scope) {
  const assessment = String(scope || '').replace(
    /(?:无异常|没有异常|无问题|没有问题)/g,
    '正常',
  ).replace(/(?:是否|能否)/g, '');
  if (/(?:不适用|无需|没有此功能|无此功能|na)/i.test(assessment)) {
    return { value: 'NA', reason: '不适用' };
  }
  if (/(?:不通过|未通过|没有通过|不合格|失败|异常|否|不是|未完成|不到位)/.test(assessment)) {
    return { value: '否', reason: '否定表达' };
  }
  if (field === 'internalCal' && /(?:通过|正常|成功|ok)/i.test(assessment)) {
    return { value: '是', reason: '通过表达' };
  }
  if (/(?:完成|已完成|已调平|调到水平|正常|干净|是|对的|可以)/.test(assessment)) {
    return { value: '是', reason: '肯定表达' };
  }
  return null;
}

function bestCandidate(candidates) {
  const valid = candidates.filter(Boolean);
  if (!valid.length) return null;
  valid.sort((left, right) => (
    Number(right.confidence ?? -1) - Number(left.confidence ?? -1)
    || left.startMs - right.startMs
  ));
  const best = valid[0];
  const alternatives = [...new Set(
    valid.filter((candidate) => candidate.value !== best.value)
      .map((candidate) => candidate.value),
  )];
  return {
    ...best,
    alternatives,
    conflict: alternatives.length > 0,
    requiresReview: best.requiresReview || alternatives.length > 0,
  };
}

export function extractSpeechKeywords(transcript, options = {}) {
  const threshold = floatSetting(
    options.confidenceThreshold,
    DEFAULT_MIN_CONFIDENCE,
    0.01,
    1,
  );
  const segments = (Array.isArray(transcript) ? transcript : [])
    .map((segment) => ({
      text: String(segment?.text || ''),
      normalized: normalizeSpeechText(segment?.text),
      startMs: Math.max(0, Number(segment?.startMs) || 0),
      endMs: Math.max(0, Number(segment?.endMs) || 0),
      confidence: Number.isFinite(Number(segment?.confidence))
        ? Number(segment.confidence)
        : null,
    }))
    .filter((segment) => segment.normalized);

  const weighingNumbers = [];
  const fieldCandidates = {
    cleanliness: [],
    level: [],
    internalCal: [],
  };
  const qualitative = [];

  for (const segment of segments) {
    const requiresReview = lowConfidence(segment.confidence, threshold);
    for (const match of segment.normalized.matchAll(/第([一二三四五六七八九1-9])次/g)) {
      const sequence = normalizeNumber(match[1]);
      if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9) continue;
      weighingNumbers.push({
        sequence,
        spoken: `第${match[1]}次`,
        startMs: segment.startMs,
        endMs: segment.endMs,
        confidence: segment.confidence,
        requiresReview,
        text: segment.text,
      });
    }

    const allTerms = Object.entries(FIELD_TERMS)
      .flatMap(([field, terms]) => terms.map((term) => ({ field, term })))
      .map((entry) => ({
        ...entry,
        index: segment.normalized.indexOf(entry.term),
      }))
      .filter((entry) => entry.index >= 0)
      .sort((left, right) => left.index - right.index);
    for (const entry of allTerms) {
      const nextIndex = allTerms
        .map((candidate) => candidate.index)
        .filter((index) => index > entry.index)
        .sort((left, right) => left - right)[0];
      const scope = segment.normalized.slice(
        entry.index,
        nextIndex === undefined ? entry.index + 24 : nextIndex,
      );
      const answer = fieldAnswer(entry.field, scope);
      if (!answer) continue;
      fieldCandidates[entry.field].push({
        value: answer.value,
        spoken: scope.slice(0, 32),
        reason: answer.reason,
        startMs: segment.startMs,
        endMs: segment.endMs,
        confidence: segment.confidence,
        requiresReview,
        text: segment.text,
      });
    }

    if (/重新称(?:量|重)?/.test(segment.normalized)) {
      qualitative.push({
        value: '重新称',
        startMs: segment.startMs,
        endMs: segment.endMs,
        confidence: segment.confidence,
        requiresReview,
        text: segment.text,
      });
    }
    if (/无(?:异常|问题)/.test(segment.normalized)) {
      qualitative.push({
        value: '无异常',
        startMs: segment.startMs,
        endMs: segment.endMs,
        confidence: segment.confidence,
        requiresReview,
        text: segment.text,
      });
    }
    if (
      /^(?:无|没有)$/.test(segment.normalized)
      || /(?:异常|问题)(?:为|是)?(?:无|没有)/.test(segment.normalized)
    ) {
      qualitative.push({
        value: '无',
        startMs: segment.startMs,
        endMs: segment.endMs,
        confidence: segment.confidence,
        requiresReview,
        text: segment.text,
      });
    }
  }

  const fields = Object.fromEntries(
    Object.entries(fieldCandidates).map(([field, candidates]) => [
      field,
      bestCandidate(candidates),
    ]),
  );
  for (const [field, candidate] of Object.entries(fields)) {
    if (candidate) candidate.label = FIELD_LABELS[field];
  }
  return {
    weighingNumbers,
    fields,
    qualitative,
    recognizedCount: {
      weighingNumbers: weighingNumbers.length,
      fields: Object.values(fields).filter(Boolean).length,
      qualitative: qualitative.length,
    },
  };
}

export function reconcileSpeechNumbers(
  weighingNumbers,
  stableSegments,
  options = {},
) {
  const maxGapSeconds = floatSetting(options.maxGapSeconds, 20, 1, 120);
  const segments = (Array.isArray(stableSegments) ? stableSegments : [])
    .filter((segment) => (
      Number.isFinite(Number(segment?.sequence))
      && Number.isFinite(Number(segment?.off))
    ))
    .map((segment) => ({
      sequence: Number(segment.sequence),
      off: Number(segment.off),
      point: Number(segment.point),
      idx: Number(segment.idx),
    }));
  const reconciled = (Array.isArray(weighingNumbers) ? weighingNumbers : [])
    .map((speech) => {
      const midpointSeconds = (Number(speech.startMs) + Number(speech.endMs))
        / 2000;
      const nearest = segments.reduce((best, segment) => {
        const distance = Math.abs(segment.off - midpointSeconds);
        if (!best || distance < best.distance) return { segment, distance };
        return best;
      }, null);
      if (!nearest || nearest.distance > maxGapSeconds) {
        return {
          ...speech,
          stableSequence: null,
          state: 'unresolved',
          requiresReview: true,
          gapSeconds: nearest ? Math.round(nearest.distance * 1000) / 1000 : null,
        };
      }
      const globalMatch = speech.sequence === nearest.segment.sequence;
      const groupMatch = !globalMatch
        && speech.sequence >= 1
        && speech.sequence <= 3
        && speech.sequence === nearest.segment.idx;
      return {
        ...speech,
        stableSequence: nearest.segment.sequence,
        stablePoint: nearest.segment.point,
        stableIdx: nearest.segment.idx,
        matchScope: globalMatch ? 'global' : groupMatch ? 'point' : null,
        state: globalMatch || groupMatch ? 'matched' : 'conflict',
        requiresReview: speech.requiresReview || (!globalMatch && !groupMatch),
        gapSeconds: Math.round(nearest.distance * 1000) / 1000,
      };
    });
  const conflicts = reconciled.filter((item) => item.state === 'conflict');
  const unresolved = reconciled.filter((item) => item.state === 'unresolved');
  return {
    weighingNumbers: reconciled,
    matchedCount: reconciled.filter((item) => item.state === 'matched').length,
    conflictCount: conflicts.length,
    unresolvedCount: unresolved.length,
    requiresReview: conflicts.length > 0 || unresolved.length > 0,
    conflicts,
    unresolved,
  };
}

function baseResult(status, config = {}) {
  return {
    schemaVersion: 1,
    engine: 'whisper.cpp',
    state: status.state,
    stateLabel: status.state,
    enabled: status.enabled,
    binaryPresent: status.binaryPresent,
    modelPresent: status.modelPresent,
    vadModelPresent: status.vadModelPresent,
    confidenceThreshold: status.confidenceThreshold,
    language: status.language,
    model: status.modelName,
    vad: {
      engine: 'silero-vad-6.2.0',
      model: status.vadModelName,
      threshold: status.vadThreshold,
    },
    audioPolicy: status.audioPolicy,
    transcript: [],
    keywords: {
      weighingNumbers: [],
      fields: {
        cleanliness: null,
        level: null,
        internalCal: null,
      },
      qualitative: [],
      recognizedCount: {
        weighingNumbers: 0,
        fields: 0,
        qualitative: 0,
      },
    },
    sequence: {
      matchedCount: 0,
      conflictCount: 0,
      unresolvedCount: 0,
      requiresReview: false,
      conflicts: [],
      unresolved: [],
    },
    requiresReview: true,
    warnings: [],
  };
}

/**
 * Transcribe only speech-active windows from uploaded video. Audio is written to
 * an OS temporary directory, never to the application data directory.
 */
export async function recognizeSpeech({
  ffmpegPath,
  filePath,
  media,
  segments = [],
  config = {},
} = {}) {
  const status = getSpeechRecognitionStatus({ ...config, ffmpegPath });
  const result = baseResult(status, config);
  if (!status.enabled) {
    result.stateLabel = '已关闭';
    return result;
  }
  if (!status.available) {
    result.stateLabel = '本地模型未部署';
    result.warnings.push(
      'ASR 未启用：缺少 whisper-cli、中文模型或 Silero VAD 模型，口述项须人工确认',
    );
    return result;
  }
  if (!media?.audioCodec) {
    result.state = 'no-audio';
    result.stateLabel = '视频无音轨';
    result.warnings.push('视频没有音轨，语音关键词未识别；口述项须人工确认');
    return result;
  }

  const timeoutMs = integerSetting(
    config.asrTimeoutMs ?? process.env.ASR_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    10_000,
    60 * 60_000,
  );
  const threads = status.threads;
  const threshold = status.confidenceThreshold;
  const language = status.language;
  const binaryPath = findExecutable(binaryCandidates(config));
  const modelPath = findModel(modelCandidates(config));
  const vadModelPath = findModel(vadModelCandidates(config));
  const asrRoot = dirname(dirname(modelPath));
  const binaryArgument = relative(asrRoot, binaryPath);
  const modelArgument = relative(asrRoot, modelPath);
  const vadModelArgument = relative(asrRoot, vadModelPath);
  const workDir = mkdtempSync(join(tmpdir(), 'tianping-asr-'));
  const startedAt = Date.now();

  try {
    const wavPath = join(workDir, 'audio.wav');
    const outputPrefix = join(workDir, 'result');
    const extracted = await extractAudio({
      ffmpegPath,
      filePath,
      outputPath: wavPath,
      timeoutMs,
    });
    if (extracted.code !== 0 || !existsSync(wavPath)) {
      throw new Error('本地音频提取失败');
    }

    const transcript = await transcribeAudio({
      binaryArgument,
      modelArgument,
      vadModelArgument,
      vadThreshold: status.vadThreshold,
      language,
      threads,
      wavPath,
      outputPrefix,
      timeoutMs,
      asrRoot,
    });
    transcript.sort((left, right) => left.startMs - right.startMs);
    result.transcript = transcript;
    const keywords = extractSpeechKeywords(transcript, {
      confidenceThreshold: threshold,
    });
    const sequence = reconcileSpeechNumbers(keywords.weighingNumbers, segments, {
      maxGapSeconds: config.asrSequenceMatchSeconds,
    });
    result.keywords = {
      ...keywords,
      weighingNumbers: sequence.weighingNumbers,
    };
    result.sequence = {
      matchedCount: sequence.matchedCount,
      conflictCount: sequence.conflictCount,
      unresolvedCount: sequence.unresolvedCount,
      requiresReview: sequence.requiresReview,
      conflicts: sequence.conflicts,
      unresolved: sequence.unresolved,
    };
    result.requiresReview = sequence.requiresReview
      || Object.values(keywords.fields).some((candidate) => candidate?.requiresReview)
      || keywords.qualitative.some((item) => item.requiresReview)
      || keywords.recognizedCount.weighingNumbers === 0
        && keywords.recognizedCount.fields === 0;
    result.state = transcript.length ? 'completed' : 'no-speech';
    result.stateLabel = {
      completed: '已完成',
      partial: '部分完成',
      failed: '识别失败',
      'no-speech': '未检测到有效语音',
    }[result.state];
    result.inferencePasses = 1;
    result.elapsedMs = Date.now() - startedAt;
    for (const conflict of sequence.conflicts) {
      result.warnings.push(
        `语音“${conflict.spoken}”与稳定读数段第 ${conflict.stableSequence} 次不一致；`
        + '以稳定段为主，并标记待核对',
      );
    }
    for (const unresolved of sequence.unresolved) {
      result.warnings.push(`语音“${unresolved.spoken}”附近未找到稳定读数段；请人工核对`);
    }
    return result;
  } catch (error) {
    result.state = 'failed';
    result.stateLabel = '识别失败';
    result.elapsedMs = Date.now() - startedAt;
    result.warnings.push(`ASR 处理失败：${String(error?.message || error).slice(0, 300)}`);
    return result;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

