export const WHISPER_CPP_VERSION = '1.9.2';
export const WHISPER_MODEL_NAME = 'ggml-base-q5_1.bin';
export const WHISPER_VAD_MODEL_NAME = 'ggml-silero-v6.2.0.bin';

const releaseBase = 'https://github.com/ggml-org/whisper.cpp/releases/download/'
  + `v${WHISPER_CPP_VERSION}`;
const githubMirror = String(
  process.env.TIANPING_GITHUB_MIRROR || 'https://ghproxy.net/',
).replace(/\/?$/, '/');

function githubAsset(name) {
  const url = `${releaseBase}/${name}`;
  return {
    url,
    fallbackUrls: githubMirror ? [`${githubMirror}${url}`] : [],
  };
}

export const ASR_ASSETS = Object.freeze([
  {
    name: 'whisper-bin-x64.zip',
    ...githubAsset('whisper-bin-x64.zip'),
    sha256: '49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a',
    component: 'whisper-cpp-windows-x64',
  },
  {
    name: 'whisper-bin-ubuntu-x64.tar.gz',
    ...githubAsset('whisper-bin-ubuntu-x64.tar.gz'),
    sha256: '46811a3ecf584307480a220b9ef5ff81b7b22dc41577cbc274ce3afc61f753b1',
    component: 'whisper-cpp-linux-x64',
  },
  {
    name: WHISPER_MODEL_NAME,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/'
      + WHISPER_MODEL_NAME,
    sha256: '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898',
    component: 'whisper-model-base-q5_1',
  },
  {
    name: WHISPER_VAD_MODEL_NAME,
    url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/'
      + WHISPER_VAD_MODEL_NAME,
    sha256: '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987',
    component: 'silero-vad-model',
  },
  {
    name: 'WHISPER-CPP-LICENSE.txt',
    url: `https://raw.githubusercontent.com/ggml-org/whisper.cpp/v${WHISPER_CPP_VERSION}/LICENSE`,
    sha256: '94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d',
    component: 'whisper-cpp-license',
  },
  {
    name: 'WHISPER-MODEL-LICENSE.txt',
    url: 'https://raw.githubusercontent.com/openai/whisper/main/LICENSE',
    sha256: 'b5d65a59060e68c4ff940e1eddfa6f94b2d68fdf58ed7f4dd57721c997e35e9d',
    component: 'whisper-model-license',
  },
  {
    name: 'SILERO-VAD-LICENSE.txt',
    url: 'https://raw.githubusercontent.com/snakers4/silero-vad/master/LICENSE',
    sha256: '2e63e9a38b6e8fc0c7bc37ce174caca1862870856c6daf5697cfb785e925520b',
    component: 'silero-vad-license',
  },
]);

export const ASR_ASSET_NAMES = Object.freeze(
  ASR_ASSETS.map((asset) => asset.name),
);

