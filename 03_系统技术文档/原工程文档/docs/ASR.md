# 本地低占用 ASR 模块

## 1. 适用范围

客户语音需求限于视频上传后的离线关键词识别：

- “第一次”至“第九次”，兼容“第1次”至“第9次”；
- “清洁”“水平调节”“内部校正是否通过”的口述答案；
- “是”“否”“无异常”“不适用”“重新称”等定性表达。

系统不做拍摄过程中的实时语音交互，不接在线语音服务，也不单独保存提取出的音频。
ASR 结果只生成候选值；稳定读数段序列始终是称重次数的主依据。

## 2. 推荐方案

推荐并已内置 `whisper.cpp 1.9.2` + `ggml-base-q5_1.bin` + Silero VAD 6.2.0：

| 项目 | 推荐配置 | 低占用措施 |
| --- | --- | --- |
| 推理硬件 | x86_64 CPU，无需 GPU | 默认 2 线程，不与 OCR 并行 |
| 模型 | 多语言 `base`，5-bit 量化 | 固定 59,707,625 字节模型随安装包内置 |
| 语音检测 | Silero VAD 6.2.0 | 使用语音概率而非录音绝对分贝 |
| 输入 | 16 kHz、单声道、16-bit PCM | 使用内置 Silero VAD 概率模型筛除静音 |
| 并发 | 全局分析队列串行 | 同一时刻只运行一个 ASR 进程 |
| 音频 | 操作系统临时目录 | 推理结束立即删除，不写入数据目录 |
| 内存目标 | 约 300 MB 量级 | 需在客户目标机实测峰值，不能以本机猜测替代验收 |

模块不按绝对分贝设置“语音/静音”边界，避免麦克风增益、手机距离和环境底噪造成
不同录音之间结果大幅漂移。音频先统一为 16 kHz 单声道 PCM，再交给 whisper.cpp
内置的 Silero VAD；VAD 根据语音概率自动选择送入 Whisper 的片段，整段视频只启动
一次模型进程，并继续保留原始视频时间戳。

ASR 可用时，分析器在视频 OCR 完成后先终止常驻 Tesseract worker，再启动
`whisper-cli`。这会增加下一次 OCR 的初始化时间，但可避免两个推理运行时在低内存
服务器上同时驻留。

如果现场实测 `base-q5_1` 仍造成队列积压，可改用 `ggml-tiny-q5_1.bin` 进一步降低
占用；但 tiny 对中文和口音的表现通常下降，必须重新验证关键词准确率。不能为了降低
资源而默认使用未验证的极小模型。

## 3. 离线资产布局

ASR 的 Windows/Linux 运行库、模型和许可证由构建脚本按固定版本下载、校验并放入
每一个最终安装包和 Docker 镜像。客户不需要另行下载、解压或挂载 ASR 文件。
大型生成资产不进入 Git 源码提交，但属于最终交付物。

```text
asr/
  bin/
    win32/whisper-cli.exe        Windows x64
    win32/*.dll                  内置 CPU 后端与运行库
    linux/whisper-cli            Linux x64 与 Docker
    linux/lib*.so*               内置共享库
  models/
    ggml-base-q5_1.bin
    ggml-silero-v6.2.0.bin
  LICENSES/
    WHISPER-CPP-LICENSE.txt
    WHISPER-MODEL-LICENSE.txt
    SILERO-VAD-LICENSE.txt
  VERSION.txt
```

固定发布资产：

| 资产 | 版本/来源 | SHA-256 |
| --- | --- | --- |
| Windows x64 运行包 | whisper.cpp v1.9.2 | `49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a` |
| Linux x64 运行包 | whisper.cpp v1.9.2 | `46811a3ecf584307480a220b9ef5ff81b7b22dc41577cbc274ce3afc61f753b1` |
| `ggml-base-q5_1.bin` | ggerganov/whisper.cpp | `422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898` |
| `ggml-silero-v6.2.0.bin` | ggml-org/whisper-vad | `2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987` |

`scripts/fetch-release-assets.mjs --asr` 在构建期下载以上原件并强制校验哈希，
`scripts/prepare-asr-assets.mjs` 再按目标平台展开运行库。正式安装包制作完成后
完全断网可运行，应用运行阶段不会访问 GitHub、Hugging Face 或任何语音服务。

从源码直接运行时可执行 `npm run prepare:asr`，脚本会按当前操作系统自动下载、
校验并安装内置文件。正式客户环境只需安装离线成品，不需要执行该命令。

## 4. 配置

```dotenv
ASR_ENABLED=true
ASR_BINARY_PATH=
ASR_MODEL_PATH=
ASR_VAD_MODEL_PATH=
ASR_LANGUAGE=zh
ASR_THREADS=2
ASR_TIMEOUT_MS=600000
ASR_MIN_CONFIDENCE=0.8
ASR_VAD_THRESHOLD=0.5
ASR_SEQUENCE_MATCH_SECONDS=20
```

ASR 始终是辅助能力，不设置“必需”开关。模型禁用、加载失败、超时或关键词缺失时，
对应口述项保持待人工确认，视觉读数、判定、提交、复核和导出继续正常完成，健康检查
也不会因 ASR 不可用而失败。

Docker Compose 使用镜像内 `/app/asr`，不会挂载宿主机模型：

```bash
ASR_BINARY_PATH=/app/asr/bin/linux/whisper-cli
ASR_MODEL_PATH=/app/asr/models/ggml-base-q5_1.bin
```

## 5. 处理流程

1. FFprobe 确认视频存在 AAC 音轨。
2. FFmpeg 将视频音轨统一提取为 16 kHz 单声道临时 WAV。
3. 单次调用本地 `whisper-cli`，由内置 Silero VAD 自动选取语音片段。
4. 九次编号和固定问答词在本地后处理层按受控词表解析，不使用可能因平台编码而不稳定
   的模型提示词参数。
5. 从 Whisper token 概率计算关键词置信度，不设置伪造置信度下限。
6. 将“第几次”与时间最近的稳定读数段核对；差值默认不超过 20 秒才视为可比较。
7. 写入 `speech_json`，包含文本、时间、置信度、字段候选、编号冲突和警告。
8. 在 `finally` 中递归删除临时目录，不保留派生音频。

编号一致时只做辅助标记；编号冲突时保留“语音编号”和“稳定段编号”两项，记录页
显示“待核对”，规则仍使用稳定段编号。口述字段不会自动成为正式答案，检验人员点击
“采用候选值”后才写入记录，并通过现有字段修改接口保存前后值、操作人、时间和理由。

## 6. 准确率验收

正式交付前至少完成：

- 覆盖九次编号、“是/否/NA”“重新称”等全部受控关键词；
- 覆盖实际人员口音、手机麦克风距离、设备环境噪声和固定支架机位；
- 对每个关键词分别统计精确率和召回率，不以整句字准确率替代字段级指标；
- 语音编号与稳定段不一致、未定位、低置信和模型失败场景均有人工核对记录；
- 客户目标 4 核/4 GB、无 GPU 机器上的峰值内存、单次增量耗时和队列积压实测；
- 字段级关键词准确率达到需求规定的 95% 后，再签认 PR-010。

当前系统已内置运行文件，并完成模型加载及客户样例音频推理冒烟；但未完成目标机
全量样本测试前，不得把字段级 ASR 准确率标为已验收。

三段客户样例的实际转写、置信度、组内编号匹配和误识别情况见
[ASR_AUDIO_AUDIT_2026-11-22.md](ASR_AUDIO_AUDIT_2026-11-22.md)。

