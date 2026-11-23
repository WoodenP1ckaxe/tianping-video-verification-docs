# 4 核 / 4 GB 远端补充测试报告

> 后续修复：本报告中的 Docker 字体、Linux systemd、ASR 置信度、PDF 时间和页脚问题已在
> `verification/regression-fixes-20261122/FIX_REPORT.md` 中修复并复验。

测试日期：2026-11-22  
测试对象：当前 `tianping-system` 源码  
测试主机：腾讯云 KVM，Ubuntu 24.04.4 LTS，4 vCPU，3.6 GiB 可用内存（标称 4 GB），60 GB 数据盘  
结论：核心运行链路通过 4c4g 压力验收，但 Docker 默认健康检查、Linux systemd 注册、ASR 置信度和 PDF 版式仍有明确缺陷。

## 1. 环境与版本

- CPU：4 vCPU
- 内存：3.6 GiB，另有 1.9 GiB Swap
- Docker Engine：29.1.3
- Docker Compose：2.40.3
- Node.js：容器内置 24，原生包运行时 Node.js 24.12.0
- FFmpeg：容器 Debian 包 5.1.9
- ASR：whisper.cpp 1.9.2
- 模型：`ggml-base-q5_1.bin`
- VAD：`ggml-silero-v6.2.0.bin`
- 浏览器端到端：Microsoft Edge + Playwright，经 SSH 回环隧道访问远端

源码与客户样例归档上传后，本地和远端 SHA-256 一致。大型客户媒体与本地验证目录未进入源码归档。

### 1.1 最终本地回归

`npm run check` 为 138 个文件、0 警告；`npm test` 为
74/74 通过、0 失败、0 跳过；覆盖率运行同样 74/74 通过，行 82.50%、分支
64.25%、函数 87.31%。`repo:check` 通过。

## 2. Docker Compose

### 2.1 原始 Dockerfile

Docker Hub 与默认 Debian 源在目标机不可达；使用腾讯云镜像后可以完成基础镜像和软件包下载。Hugging Face 模型地址超时，且下载脚本没有单请求超时，原始在线构建会长时间挂起。

为继续验证应用，测试时使用以下仅限远端测试副本的适配：

- Debian 源改为腾讯云镜像；
- ASR 七份固定资产使用本地 SHA-256 已核验缓存；
- 页面运行仍使用当前源码；
- 测试结束后未修改本地业务源码。

镜像成功构建：

- Image：`tianping-system:1.0.9`
- Image ID：`sha256:802e90214dba5e60ef9063759ed937a58f539e86298d9df687bd33d289449fc7`
- Size：617,036,782 bytes
- 运行用户：`node`
- Root filesystem：read-only
- Priviledged：false
- Capabilities：全部丢弃
- `no-new-privileges`：启用

### 2.2 原始字体配置失败

原始 Dockerfile 和 Compose 的 `PDF_FONT_PATH` 指向
`/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc`。

容器内文件存在，但 PDF 导出器只接受 TrueType `glyf/loca` 表；该 TTC 使用 CFF 轮廓，加载错误为：

```text
中文字体缺少必要表 loca：/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
```

因此按仓库原始 Compose 启动后 `/healthz` 固定返回 503，Docker 容器为 `unhealthy`。

测试时把项目已有的 `NotoSansCJKsc-VF.ttf` 只读挂载并通过 Compose override 指定后，健康检查恢复 200。

### 2.3 离线运行

使用 `--network none` 启动同一镜像，仅通过 `docker exec` 在容器内访问
`http://127.0.0.1:8080/healthz`：

```json
{
  "httpStatus": 200,
  "serviceStatus": "ok",
  "analyzer": true,
  "speech": "ready",
  "font": true,
  "preview": true,
  "queue": true
}
```

说明在字体配置正确时，完整镜像不依赖运行时外网。

## 3. 4c4g 端到端与 ASR

通过 SSH 回环隧道使用 Playwright 上传含 AAC 音轨、人员和设备二维码的合成 MP4：

- 上传、排队、视频帧 OCR、真实 Whisper 推理、身份核对和记录生成全部完成。
- 任务 ID：`T-202611221906-6CB6AD`
- 记录 ID：`20260928-F001-02`
- 任务耗时：44,948 ms
- ASR：`completed`
- Whisper 推理耗时：17,810 ms
- Whisper 转录：23 段
- 称重编号：识别 9 个
- 编号匹配 3 个，冲突 6 个；冲突正确保留并转人工核对，稳定段仍是主依据
- 9 项读数均有截图、帧偏移、显示屏 bbox 和识别框
- 单段测试时容器 cgroup 峰值：682,123,264 bytes（约 650 MiB）

ASR 真实运行成功，但发现置信度缺陷，详见第 8 节。

## 4. 20 段 OCR + ASR 压力测试

在容器内直接上传 20 份同一合成视频，全部执行真实 OCR 与 Whisper：

- 成功：20/20
- 上传量：533,373,920 bytes
- 峰值积压：19
- 最大并行分析数：1
- 上传总耗时：26,928 ms
- 队列总耗时：750,883 ms
- 总墙钟：777,811 ms（约 12 分 58 秒）
- 上传 P50/P95：614 / 5,698 ms
- 任务耗时 P50/P95/max：66,766 / 92,247 / 95,606 ms
- ASR 全部是 `completed`
- ASR 单段耗时 P50/P95：13,643 / 16,107 ms
- 每条均 9 项读数、截图和真实识别框
- 任务 ID、记录 ID 全部唯一

20 段后数据库：

- `integrity_check=ok`
- `foreign_keys=1`
- 外键违例 0
- 24 个任务均为 `已完成`
- 应用生成的 ASR 临时目录均已删除

连续测试中途采集：

- 容器 CPU 约 101%–201%
- Docker working set 约 818 MiB
- cgroup 峰值（含页缓存）1,782,616,064 bytes（约 1.66 GiB）
- 宿主机仍约有 2.2 GiB 可用内存，无 OOM

## 5. 4c4g 五用户查询性能

隔离实例灌入 10,000 条记录，5 个独立检验员账号同时持续查询。

短测：

- 200 次请求，0 错误，45 RPS
- 列表 P95：162 ms
- 结论筛选 P95：267 ms
- 状态页 P95：249 ms
- 详情 P95：211 ms

持续测：

- 2000 次请求，0 错误，45.3 RPS，44,163 ms
- 列表 P95：260 ms
- 结论筛选 P95：187 ms
- 状态页 P95：229 ms
- 详情 P95：209 ms

所有指标远低于 2 秒目标。

## 6. 大文件断点续传

生成有效 MP4：

- Size：506,679,625 bytes（483.2 MiB）
- Duration：5,175.667 秒（87 分钟）

测试过程：

1. 正常上传首个 8 MiB 分片。
2. 第二个 8 MiB 分片在一半处主动模拟网络断开。
3. 服务端已将已到达的 2 MiB 安全落盘，offset 从 `8,388,608` 推进到 `10,485,760`。
4. 从服务端真实 offset 10 MiB 继续续传。
5. 完整上传总耗时约 14.5 秒。
6. 最终因视频时长 87 分钟超过 30 分钟上限，按预期返回 `422 E_TOO_LONG`。
7. 失败上传状态保存错误码，并通过 DELETE 清理成功。

该场景验证了部分分片落盘、真实 offset 恢复、完整文件媒体校验和失败会话清理，不是只测声明大小。

## 7. 备份、恢复与故障注入

- 性能数据集成功备份：63,569,920 bytes。
- 独立恢复实例读取到 10,000 条记录、3 个初始任务、2,611 条审计。
- 恢复数据库 `integrity_check=ok`，外键违例 0。
- 正常 Compose 重启后健康 200，记录/任务数量由 24/24 保持为 24/24。
- 在上传任务处于 `分析中` 时强制 `SIGKILL` 容器。
- 通过 `docker kill` 属于人工停止，`unless-stopped` 不会自动启动；手动 Compose 启动后，在途任务正确变为：
  - `失败`
  - `E-RESTARTED`
  - 原因：服务重启时任务正在分析，已标记失败，可人工重试
- 恢复后数据库完整性和外键均正常。

## 8. 原生 Linux 包

从当前源码隔离构建：

- 包大小：226,470,968 bytes
- SHA-256：`2DC7591F2A10AC5275AE648A1B2F0FC4B76A4F55B97F7294F643ADE4661AD297`
- `server.js`、`api.js`、`db.js`、`analyzer.js`、`speech-recognition.js` 和前端 `app.js`
  与当前源码哈希完全一致
- 包含 Linux whisper-cli、模型、VAD、中文字体和 Node 24

### 8.1 普通用户模式

- 安装、启动、健康 200
- `analyzer/ASR/PDF/预览/队列` 全部可用
- 数据目录权限 700，初始口令文件权限 600
- 重启后 3 条初始记录保持为 3 条
- 默认卸载保留数据
- 重装后读取原数据库，健康 200，记录数仍为 3
- 显式 purge 后安装目录和数据目录均删除

### 8.2 system 模式

- 安装并启动成功，健康 200
- 数据目录属于专用 `tianping-video-verification` 用户，权限 700
- 重启后健康 200
- purge 卸载成功
- 但 systemd 注册失败并回退到 manual：目标机存在 systemd，仍生成
  `SERVICE_MODE='manual'`，没有注册 unit。

原因位于 `packaging/linux/install.sh` 第 170–172 行：

```sh
case "$INSTALL_DIR $DATA_DIR" in
  *[[:space:]]*) SERVICE_MODE=manual ;;
esac
```

两个路径用空格拼接后必然匹配 `*[[:space:]]*`，因此任何 system/systemd-user 模式都会强制
退回 manual。该问题会使服务器重启后服务不自动恢复。

## 9. PDF 与导出

### 9.1 导出功能

- 单条 PDF：1 页 A4 纵向，36,168,170 bytes
- 批量 PDF：3 页 A4 纵向，36,203,250 bytes
- 周统计 PDF：1 页 A4 横向，36,192,409 bytes
- CSV：653 bytes
- 单条 PNG 预览：246,431 bytes
- 119 条记录批量 PDF：约 38,240,221 bytes，服务端生成约 0.9 秒
- 导出操作进入审计

PDF 内容中文可读，页数、方向和中文嵌入正常。

### 9.2 已知 CSV 缺陷仍存在

性能实例筛选总数 9,997 条，CSV 实际仅输出约 5,000 行，仍受
`getRecords()` 默认 5000 条上限影响。

### 9.3 PDF 文件体积

每个单条/小型 PDF 都约 34.5 MiB，主要来自完整可变中文字体嵌入。经由低速链路下载
36 MiB 约需 60 秒。功能正确，但应评估字体子集化，否则远程打印下载体验较差。

### 9.4 未复核记录时间错误

批量 PDF 包含 `includeUnverified` 记录时，未提交、未复核时间显示为：

```text
1970-01-01 08:00
```

而不是“未提交/未复核”。原因位于 `src/services/exporter.js` 第 903–910 行：
先对空时间调用 `formatDateTime`，得到 Unix epoch，再传给 `safeText`，fallback 不再生效。

### 9.5 页脚裁切

PDF 底部说明与模板 `footerExtra` 拼接后直接以单行绘制，没有 `wrap()`。实测“双量程量程切换完整”等尾部文字越过页面右边界并被裁切。

## 10. ASR 置信度缺陷

目标机真实 Whisper 输出 23 段文本、9 个称重编号，但所有转录和关键词的置信度均为
`null`/`0`，因此所有候选一律待人工核对。

原因：

- `src/services/speech-recognition.js` 第 370 行使用 `-oj`。
- whisper.cpp 的普通 JSON 只有 `timestamps`、`offsets`、`text`，没有 `tokens`。
- 使用同版本程序的 `-ojf`（`--output-json-full`）后，JSON 包含 `tokens[].p`，
  例如 `0.965068`、`0.993712`，能够按现有 `tokenConfidence()` 正确计算。

建议把输出参数改为 `-ojf`，并增加真实 token 概率回归断言。

## 11. 新增/确认缺陷汇总

| 优先级 | 缺陷 | 证据 |
| --- | --- | --- |
| 高 | Docker 默认字体配置使健康检查固定 503 | Dockerfile 和 Compose 默认 TTC 缺少 `loca` |
| 高 | Linux 安装器永远退回 manual，systemd 不注册 | install.sh 两路径拼接后的空格判断 |
| 中 | ASR 置信度全部丢失 | `-oj` 不输出 token，`-ojf` 才输出 |
| 中 | 批量 PDF 未复核记录时间显示 1970 | exporter 空值处理错误 |
| 中 | PDF 长页脚超过右边界被裁切 | 未换行绘制 |
| 中 | 单个 PDF 约 34.5 MiB | 完整字体嵌入，低速链路下载约 60 秒 |
| 中 | ASR 构建下载无单请求超时 | Hugging Face 不可达时构建长期挂起 |
| 待修 | 上一轮 CSV 截断、健康接口信息泄露、设置部分提交、账号枚举等仍存在 | 当前源码未修改对应代码 |

## 12. 未完成或仍需客户资料

- 客户正式人员和设备二维码卡面成功率。
- 客户扩展视频样本的字段级 OCR 准确率。
- 带人工真值标注的语音扩展样本与 95% 字段关键词准确率。
- 连续数天运行的资源泄漏观察。
- 法定保留到期处置和客户实际 NTP/打印机签认。
- Windows 当前源码安装包；本轮只补了 Linux 原生包和 Docker OnLinux。

## 13. 复现脚本

- `verification/remote-4c4g-20261122/remote-upload-e2e.mjs`
- `verification/remote-4c4g-20261122/remote-export-e2e.mjs`
- `verification/remote-4c4g-20261122/container-queue-asr-stress.mjs`
- `verification/remote-4c4g-20261122/container-resume-500mb.mjs`
- `verification/remote-4c4g-20261122/container-perf-seed.mjs`
- `verification/remote-4c4g-20261122/container-perf-assign.mjs`
- `verification/remote-4c4g-20261122/container-5user-perf.mjs`
- `verification/remote-4c4g-20261122/container-db-audit.mjs`

## 14. 测试环境清理

本轮专用远端容器、镜像、Docker 构建缓存、数据库、上传文件、日志和测试归档已全部删除。
远端恢复为无测试容器、无测试镜像，`/home/ubuntu/tianping-remote-20261122` 不存在；
本地临时私钥副本、隔离 Linux 构建目录、源码归档、Linux 解包目录和大型 PDF 下载也已清理。
仅保留本报告、复现脚本、健康快照、预览 PNG 和小型 CSV 证据。

