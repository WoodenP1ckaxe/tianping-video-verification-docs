import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync
} from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const jsQR = require('jsqr');
const root = resolve(import.meta.dirname);
const outputRoot = join(root, 'synthetic-samples');
const cardRoot = join(outputRoot, 'cards');
const customerRoot = resolve(root, '../../客户原需求/测试视频样例');

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`${command} 执行失败：${result.stderr || result.stdout}`);
  }
}

function generateCard(fileName, text, color) {
  const target = join(cardRoot, fileName);
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', 'color=c=white:s=300x340:d=1',
    '-vf', `qrencode=text=${text}:q=260:x=20:y=15,drawbox=x=0:y=0:w=300:h=340:color=${color}@1:t=8`,
    '-frames:v', '1',
    '-y',
    target
  ]);
  const pixels = spawnSync(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error',
      '-i', target,
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      'pipe:1'
    ],
    { maxBuffer: 10 * 1024 * 1024 }
  );
  if (pixels.status !== 0) throw new Error(`无法读取二维码 ${target}`);
  const decoded = jsQR(
    new Uint8ClampedArray(pixels.stdout),
    300,
    340,
    { inversionAttempts: 'attemptBoth' }
  );
  if (decoded?.data !== text) {
    throw new Error(`二维码 ${fileName} 期望 ${text}，实际 ${decoded?.data || '无法解码'}`);
  }
}

function generateVideo({
  base,
  personCard,
  deviceCard,
  output,
  duration,
  creationTime
}) {
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', join(customerRoot, base),
    '-loop', '1', '-i', join(cardRoot, personCard),
    '-loop', '1', '-i', join(cardRoot, deviceCard),
    '-filter_complex',
    "[0:v][1:v]overlay=12:20:enable='between(t,2,8)':repeatlast=1[tmp];" +
      "[tmp][2:v]overlay=12:20:enable='between(t,10,16)':repeatlast=1[v]",
    '-map', '[v]',
    '-map', '0:a?',
    '-t', String(duration),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-metadata', `creation_time=${creationTime}`,
    '-y',
    join(outputRoot, output)
  ]);
}

for (const base of [
  '295ed49aaa4dc37eadf402db4d0b7434.mp4',
  '13d9ccc8268f3f6c7d1dfd33e9716159.mp4'
]) {
  if (!existsSync(join(customerRoot, base))) {
    throw new Error(`缺少客户基础视频：${base}`);
  }
}

mkdirSync(cardRoot, { recursive: true });
generateCard('person-U001.png', 'U001', 'blue');
generateCard('person-U002.png', 'U002', 'orange');
generateCard('device-F001.png', 'F001', 'green');
generateCard('device-F002.png', 'F002', 'purple');

generateVideo({
  base: '295ed49aaa4dc37eadf402db4d0b7434.mp4',
  personCard: 'person-U001.png',
  deviceCard: 'device-F001.png',
  output: 'synthetic-single-F001-U001.mp4',
  duration: 272.399667,
  creationTime: '2026-09-28T00:31:00.000000Z'
});

generateVideo({
  base: '13d9ccc8268f3f6c7d1dfd33e9716159.mp4',
  personCard: 'person-U002.png',
  deviceCard: 'device-F002.png',
  output: 'synthetic-dual-F002-U002.mp4',
  duration: 393.621167,
  creationTime: '2026-09-27T23:58:00.000000Z'
});

generateVideo({
  base: '295ed49aaa4dc37eadf402db4d0b7434.mp4',
  personCard: 'person-U001.png',
  deviceCard: 'device-F002.png',
  output: 'synthetic-device-conflict-F002-U001.mp4',
  duration: 272.399667,
  creationTime: '2026-09-28T00:31:00.000000Z'
});

console.log(`合成样例已生成：${outputRoot}`);
