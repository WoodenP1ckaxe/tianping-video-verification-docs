# 严重缺陷修复报告

日期：2026-11-22

## 已修复

### 1. Docker 默认健康检查

- Docker 镜像现在下载并校验固定版本 `NotoSansCJKsc-VF.ttf`。
- `PDF_FONT_PATH` 改为 `/usr/share/fonts/truetype/tianping/NotoSansCJKsc-VF.ttf`。
- 移除不再需要的 `fonts-noto-cjk` 包，避免 CFF TTC 被错误选为 PDF 字体。
- 4c4g 实机镜像验证：默认配置 `/healthz` 返回 200，字体存在且 ASR 为 ready。

### 2. Linux systemd 安装

- 修复两个路径拼接后含空格导致无条件回退 manual 的错误。
- 4c4g 实机 `--system` 安装验证：
  - `SERVICE_MODE='systemd-system'`
  - unit 存在
  - `systemctl is-enabled` 为 `enabled`
  - `systemctl is-active` 为 `active`
  - 重启后健康 200
  - 卸载后程序和数据均按显式 purge 删除

### 3. CSV 静默截断

- CSV 导出改为按 5000 条分页遍历全部匹配记录。
- 记录型和逐读数型 CSV 都使用完整结果集。
- 回归实测 5005 条记录导出 5005 个数据行，逐读数型导出 5005 × 9 行。

### 4. 公开健康接口泄露任务信息

- `/healthz` 和 `/api/health` 只保留队列计数和耗时统计。
- 不再公开任务 ID、文件名、上传账号、当前任务或排队任务列表。

### 5. 系统设置部分提交

- 先验证全部设置，再在单个 SQLite 事务中写入设置和审计。
- 非法设置不会写入前面的合法设置。
- 数据库写入异常会完整回滚，并统一返回 `INTERNAL_ERROR`。

### 6. 内部错误码泄露

- 只有 `HttpError` 和 `AnalyzerError` 保留公开业务错误码。
- SQLite 等底层异常不再把 `ERR_SQLITE_ERROR` 之类的内部码返回给浏览器。

### 7. PDF 明显排版错误

- 未提交、未复核时间不再显示 `1970-01-01 08:00`。
- 页脚说明按页面可用空间换行，判定式固定在页框内。
- 已生成并渲染未复核记录 PDF 目视检查：
  - 显示“提交时间：未提交”
  - 显示“复核时间：未复核”
  - 默认脚注和模板附加说明完整显示
  - 判定式未越过页框

### 8. ASR 置信度及下载超时

- 当前工作区已使用 whisper.cpp `-ojf` 完整 JSON 输出。
- 新增真实分析回归：ASR completed 时至少一个转录段必须包含有限 token 置信度。
- 发布资产下载增加 120 秒单请求超时。

## 验证结果

- `npm run check`：通过，0 警告。
- `npm run repo:check`：通过。
- `npm test`：78/78 通过。
- 新增关键回归：
  - 5005 条 CSV 全量
  - 健康接口最小披露
  - 设置校验失败回滚
  - 数据库异常回滚和错误码
  - Docker 字体/ASR/下载配置
- 当前报告目录保留 `pdf-check.mjs` 和修复后的页面渲染 PNG。

## 仍建议后续处理

- 单个 PDF 仍包含完整可变字体，文件约 17–35 MB，建议后续做字体子集化。
- 登录账号枚举和已知账号密码喷洒限流仍需独立安全改造。
- 客户扩样 OCR/ASR 准确率、长期稳定性、正式渗透测试仍需现场完成。
