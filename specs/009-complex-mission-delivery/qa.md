# 复杂任务成果包 QA

状态：PASS
日期：2026-08-29

## 自动化验证

- 后端：`npm test`，14 个测试文件、182 个测试全部通过。
- 前端：`npm run build:frontend`，TypeScript 与 Vite production build 通过。
- Worker：`npm run build:worker`，Wrangler dry-run 成功，上传体积 3685.88 KiB / gzip 734.49 KiB。
- Diff hygiene：`git diff --check` 通过。

Wrangler 尝试写入用户 Preferences 日志时收到 sandbox `EPERM`，但打包与 `--dry-run: exiting now` 均正常完成；这不是 Worker 构建失败。

## 行为验收

1. 三个 task 节点的内置 Agent 回归验证为 `0 / 1 / 1` 个 artifact：Analyze 不发布，Implement 发布阶段制品，终结节点发布完整成果包。
2. 终结节点收到两个已完成工作流的 `workflowPortfolio`，最终 bundle 含两个 `workstreams/` 文件及总览、验收报告、制品索引、HTML 和 Manifest。
3. PinMe AppKey 只在需要发布的节点读取；Analyze 节点无需 AppKey。
4. 验收页优先选择拓扑终结节点的交付，阶段制品仍可手动切换。
5. 真实 bundle fixture 通过本地 HTTP 在 Codex 浏览器打开；点击“01 市场研究”后 URL 切换为 `#stage-1`，对应工作流详情和真实制品索引可见。
6. 恶意 `<script>` 内容被 HTML 转义，技术 JSON 仅位于折叠证据区，不进入客户成品正文。

## 范围说明

本次没有部署，也没有新增数据库迁移。完整登录态验收页未做远程浏览器回归；其 TypeScript/production build 和后端选择逻辑回归已通过，实际生成的客户成果包完成了浏览器交互验证。
