#!/usr/bin/env node

import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ASR_ASSETS, ASR_ASSET_NAMES } from './asr-assets.js';

const root = resolve(import.meta.dirname, '..');
const cache = resolve(
  process.env.TIANPING_ASSET_CACHE || join(root, 'verification', 'release-assets')
);

const assets = [
  {
    name: 'node-v24.12.0-linux-x64.tar.xz',
    url: 'https://nodejs.org/dist/v24.12.0/node-v24.12.0-linux-x64.tar.xz',
    sha256: 'bdebee276e58d0ef5448f3d5ac12c67daa963dd5e0a9bb621a53d1cefbc852fd'
  },
  {
    name: 'ffmpeg-win32-x64.gz',
    url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz',
    sha256: '8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77'
  },
  {
    name: 'ffprobe-win32-x64.gz',
    url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffprobe-win32-x64.gz',
    sha256: 'f309e6223ad89d2fe54bccd420a7709b66fd27540674e92309578ed491a43c8d'
  },
  {
    name: 'ffmpeg-linux-x64.gz',
    url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz',
    sha256: 'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa'
  },
  {
    name: 'ffprobe-linux-x64.gz',
    url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffprobe-linux-x64.gz',
    sha256: '25d9b6ccb05e3d9de9e04e31e2506d8dd7f9f0418981965ac6df12e8d3afd067'
  },
  {
    name: 'FFMPEG-GPLv3.txt',
    url: 'https://raw.githubusercontent.com/FFmpeg/FFmpeg/n6.1.1/COPYING.GPLv3',
    sha256: '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903'
  },
  {
    name: 'innosetup-6.7.4.exe',
    url: 'https://github.com/jrsoftware/issrc/releases/download/is-6_7_4/innosetup-6.7.4.exe',
    sha256: 'a549929319f9120716677c685535ca4671e4b937b5fdc87e2585f32d8eb30e8c'
  },
  {
    name: 'ChineseSimplified.isl',
    url: 'https://raw.githubusercontent.com/jrsoftware/issrc/main/Files/Languages/ChineseSimplified.isl',
    sha256: 'e0b0b350e2245f3c5e65586dfe43d574f6e7f06f2261149aba284954b3fc9a8d'
  },
  {
    name: 'NotoSansCJKsc-VF.ttf',
    url: 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/Variable/TTF/NotoSansCJKsc-VF.ttf',
    sha256: '990c807e79c25662a5a9ecf7f971baeb2bf2eab9a559e5ecf15cdfdb8561d21f'
  },
  {
    name: 'OFL.txt',
    url: 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE',
    sha256: '6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2'
  },
  ...ASR_ASSETS
];
const fontOnly = process.argv.includes('--fonts');
const asrOnly = process.argv.includes('--asr');
const selectedAssets = fontOnly
  ? assets.filter((asset) => ['NotoSansCJKsc-VF.ttf', 'OFL.txt'].includes(asset.name))
  : asrOnly
    ? assets.filter((asset) => ASR_ASSET_NAMES.includes(asset.name))
    : assets;

async function digest(path) {
  const { createHash } = await import('node:crypto');
  const { readFile } = await import('node:fs/promises');
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function download(asset) {
  const target = join(cache, asset.name);
  const partial = `${target}.part`;
  try {
    await (await import('node:fs/promises')).access(target);
    const hash = await digest(target);
    if (asset.sha256 && hash.toLowerCase() !== asset.sha256.toLowerCase()) {
      throw new Error(`${asset.name} SHA256 不匹配：${hash}`);
    }
    console.log(`缓存 ${asset.name}  ${hash}`);
    return target;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const urls = [asset.url, ...(asset.fallbackUrls || [])].filter(Boolean);
  let lastError = null;
  for (const url of urls) {
    console.log(`下载 ${url}`);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok || !response.body) {
        throw new Error(`下载失败 ${response.status} ${url}`);
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
      const hash = await digest(partial);
      if (asset.sha256 && hash.toLowerCase() !== asset.sha256.toLowerCase()) {
        throw new Error(`${asset.name} SHA256 不匹配：${hash}`);
      }
      await rename(partial, target);
      console.log(`完成 ${asset.name}  ${hash}`);
      return target;
    } catch (error) {
      lastError = error;
      console.warn(`下载源失败，准备重试：${error.message}`);
    } finally {
      await rm(partial, { force: true });
    }
  }
  throw lastError || new Error(`无法下载 ${asset.name}`);
}

await mkdir(cache, { recursive: true });
for (const asset of selectedAssets) await download(asset);
console.log(`构建资源缓存：${cache}`);
