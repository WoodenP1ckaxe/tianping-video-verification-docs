#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ASR_ASSETS,
  WHISPER_CPP_VERSION,
  WHISPER_MODEL_NAME,
  WHISPER_VAD_MODEL_NAME,
} from './asr-assets.js';

const root = resolve(import.meta.dirname, '..');

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

const platform = argument('--platform', process.platform);
const target = resolve(argument('--target', join(root, 'asr')));
const cache = resolve(
  argument(
    '--cache',
    process.env.TIANPING_ASSET_CACHE || join(root, 'verification', 'release-assets'),
  ),
);

if (!['win32', 'linux'].includes(platform)) {
  throw new Error(`暂不支持为 ${platform} 内置 ASR；仅支持 win32 和 linux x64`);
}

function digest(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolvePromise(hash.digest('hex')));
  });
}

async function verifyAssets() {
  for (const asset of ASR_ASSETS) {
    const path = join(cache, asset.name);
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`缺少 ASR 构建资产：${asset.name}`);
    }
    const actual = await digest(path);
    if (actual.toLowerCase() !== asset.sha256.toLowerCase()) {
      throw new Error(`${asset.name} SHA256 不匹配：${actual}`);
    }
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 失败：${result.stderr || result.stdout}`);
  }
}

function findFile(directory, filename) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) return path;
    if (entry.isDirectory()) {
      const found = findFile(path, filename);
      if (found) return found;
    }
  }
  return null;
}

function copyRuntimeFiles(sourceDirectory, destination) {
  mkdirSync(destination, { recursive: true });
  const files = readdirSync(sourceDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const required = platform === 'win32'
    ? files.filter((name) => (
      name.toLowerCase() === 'whisper-cli.exe'
      || name.toLowerCase().endsWith('.dll')
    ))
    : files.filter((name) => (
      name === 'whisper-cli'
      || (name.startsWith('libwhisper') || name.startsWith('libggml'))
        && (name.endsWith('.so') || name.includes('.so.'))
    ));
  if (!required.some((name) => (
    platform === 'win32'
      ? name.toLowerCase() === 'whisper-cli.exe'
      : name === 'whisper-cli'
  ))) {
    throw new Error('ASR 发布包中缺少 whisper-cli');
  }
  for (const name of required) {
    copyFileSync(join(sourceDirectory, name), join(destination, name));
  }
  if (platform === 'linux') {
    chmodSync(join(destination, 'whisper-cli'), 0o755);
    const links = [
      ['libwhisper.so.1.9.2', 'libwhisper.so.1'],
      ['libwhisper.so.1.9.2', 'libwhisper.so'],
      ['libggml.so.0.18.1', 'libggml.so.0'],
      ['libggml.so.0.18.1', 'libggml.so'],
      ['libggml-base.so.0.18.1', 'libggml-base.so.0'],
      ['libggml-base.so.0.18.1', 'libggml-base.so'],
    ];
    for (const [source, alias] of links) {
      if (existsSync(join(destination, source))) {
        copyFileSync(join(destination, source), join(destination, alias));
      }
    }
  }
}

async function main() {
  await verifyAssets();
  const archiveName = platform === 'win32'
    ? 'whisper-bin-x64.zip'
    : 'whisper-bin-ubuntu-x64.tar.gz';
  const archive = join(cache, archiveName);
  const extraction = mkdtempSync(join(tmpdir(), 'tianping-asr-assets-'));
  try {
    if (platform === 'win32') {
      const result = spawnSync('tar', ['-xf', archive, '-C', extraction], {
        encoding: 'utf8',
        windowsHide: true,
      });
      if (result.error || result.status !== 0) {
        run('unzip', ['-q', archive, '-d', extraction]);
      }
    } else {
      const skippedLinks = [
        'libwhisper.so',
        'libwhisper.so.1',
        'libggml.so',
        'libggml.so.0',
        'libggml-base.so',
        'libggml-base.so.0',
        'libparakeet.so',
        'libparakeet.so.1',
      ].flatMap((name) => ['--exclude', `*/${name}`]);
      run('tar', ['-xzf', archive, '-C', extraction, ...skippedLinks]);
    }
    const executableName = platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
    const executable = findFile(extraction, executableName);
    if (!executable) throw new Error(`${archiveName} 中缺少 ${executableName}`);
    copyRuntimeFiles(
      dirname(executable),
      join(target, 'bin', platform),
    );
  } finally {
    rmSync(extraction, { recursive: true, force: true });
  }

  mkdirSync(join(target, 'models'), { recursive: true });
  mkdirSync(join(target, 'LICENSES'), { recursive: true });
  copyFileSync(
    join(cache, WHISPER_MODEL_NAME),
    join(target, 'models', WHISPER_MODEL_NAME),
  );
  copyFileSync(
    join(cache, WHISPER_VAD_MODEL_NAME),
    join(target, 'models', WHISPER_VAD_MODEL_NAME),
  );
  copyFileSync(
    join(cache, 'WHISPER-CPP-LICENSE.txt'),
    join(target, 'LICENSES', 'WHISPER-CPP-LICENSE.txt'),
  );
  copyFileSync(
    join(cache, 'WHISPER-MODEL-LICENSE.txt'),
    join(target, 'LICENSES', 'WHISPER-MODEL-LICENSE.txt'),
  );
  copyFileSync(
    join(cache, 'SILERO-VAD-LICENSE.txt'),
    join(target, 'LICENSES', 'SILERO-VAD-LICENSE.txt'),
  );
  writeFileSync(
    join(target, 'VERSION.txt'),
    [
      `whisper.cpp ${WHISPER_CPP_VERSION}`,
      `platform ${platform} x64`,
      `model ${WHISPER_MODEL_NAME}`,
      `vad ${WHISPER_VAD_MODEL_NAME}`,
      ...ASR_ASSETS.map((asset) => `${asset.name} sha256=${asset.sha256}`),
      '',
    ].join('\n'),
    'utf8',
  );
  console.log(`ASR 已内置：${target}`);
  console.log(
    `可执行程序：${basename(
      join(target, 'bin', platform, platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'),
    )}`,
  );
  console.log(`模型：${join(target, 'models', WHISPER_MODEL_NAME)}`);
  console.log(`VAD：${join(target, 'models', WHISPER_VAD_MODEL_NAME)}`);
}

await main();

