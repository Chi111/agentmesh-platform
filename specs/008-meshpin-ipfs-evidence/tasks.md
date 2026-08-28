# pinme-mesh 品牌与 PinMe IPFS 交付证据任务

状态：`meshpin-ipfs-evidence-004` option 1 已完成实现、审阅、QA、拆分发布与 Sepolia PM 冒烟验收。

- [x] T1 固化 `pinme-mesh Contribution / PM` 品牌、非官方背书边界和公开资产元数据；依赖：方案批准。
- [x] T2 固化 `agentmesh.deliverable-manifest.v1` schema、规范化规则、大小限制和安全 fixtures；依赖：T1。
- [x] T3 新增 replay-safe `026_meshpin_ipfs_evidence.sql`、共享领域契约及 D1/MemoryStore companion records；依赖：T2。
- [x] T4 实现 Worker 兼容 CID 解析、Manifest 校验、固定 Gateway allowlist 和验证状态机；依赖：T2。
- [x] T5 扩展手工交付与 Agent callback 的统一原子提交路径，实现 scope/version/parent CAS 与 legacy 兼容；依赖：T3、T4。
- [x] T6 实现验收绑定的交付版本集合、验收标准 hash、纠纷创建时的不可变证据快照和案件读取接口；依赖：T5。
- [x] T7 实现 PinMe/IPFS 提交引导、可见性提示、版本时间线、Manifest 文件 diff 和当前 attempt 展示规则；依赖：T5。
- [x] T8 在验收与仲裁页面展示固定 CID、验证状态、冻结版本和 CAR 导出指引；生成确定性审核档案并支持登记用户上传后的档案 CID；依赖：T6、T7。
- [x] T9 将用户可见 YD 品牌替换为 pinme-mesh/PM，并更新测试代币 name/symbol；保留内部兼容命名；依赖：T1。
- [x] T10 增加已完成 Mission 的 Agent 公开 CID 履历；补齐 CID/SSRF/Manifest/版本并发/D1 parity/浏览器 E2E 与既有交付、返工、Escrow、仲裁、奖励回归；依赖：T6、T8、T9。
- [x] T11 更新 API、运营、隐私、PinMe CLI/CAR 和迁移文档，通过统一 Review Gate 与 QA；依赖：T10。
- [x] T12 形成独立部署审批包；没有新的用户授权时不得运行 `pinme save`、部署 PM 合约或创建外部资源；依赖：T11。

## 推荐执行顺序

```text
批准方案
  -> T1
  -> T2
  -> T3 + T4
  -> T5
  -> T6 + T7
  -> T8 + T9
  -> T10
  -> T11
  -> T12（再次等待部署批准）
```

共享契约、迁移、提交原子性、隐私和纠纷快照必须串行收口；只有明确不触碰同一文件的 UI/文档或测试工作才可并行。
