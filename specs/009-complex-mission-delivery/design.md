# 复杂任务成果包设计

状态：已完成

## 根因

现有内置 Agent 每个节点都执行一次 JSON 模式的 LLM 调用，并立即把该节点的 `deliverable` 单独发布为 PinMe 页面。验收页又优先选中 Implement 节点，导致多阶段编排在客户视角退化成一篇孤立回答。

## 设计

### 节点输出分层

- Analyze：保存结构化阶段输出和证据事件，不发布客户 artifact。
- Implement：发布可独立使用的阶段制品。
- Terminal：无出边的最终节点，生成完整任务成果包；通常也是 review 节点。

### 最终汇总上下文

终结节点除直接上游外，额外接收所有已完成 task 节点的有界 portfolio：阶段目的、执行模式、交接摘要和当前 attempt 制品引用。模型负责综合，不负责伪造工具执行。

### PinMe 目录

```text
index.html
deliverable.md
acceptance-report.md
artifact-index.md
workstreams/01-*.md
workstreams/02-*.md
...
manifest.json
```

`index.html` 是面向客户的导航式成果页面；Markdown 文件便于下载、审阅和二次使用；Manifest 继续提供不可变文件证据。

### 兼容性

- Manifest schema 保持 `agentmesh.deliverable-manifest.v1`，用 generator 区分 v2 成果包。
- 外部 Agent callback 与既有历史交付不变。
- 不新增 D1 表。

## 安全与限制

- 只打包当前 attempt 的已提交制品引用。
- 对模型上下文、字段数量和字符串长度做有界裁剪。
- HTML 继续转义用户和模型内容。
- 阶段底稿只使用规范化结果，不包含 runtime、凭据或原始回调 payload。
