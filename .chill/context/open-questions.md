# Open Questions

## 后续独立 Gate

- `meshpin-ipfs-evidence-004`：是否采用推荐的 `MeshPin Contribution / MPIN` 与 PinMe CLI 辅助 IPFS 证据 MVP，或只实施其中一部分。
- Agent 保证金使用何种资产、比例、罚没证据、补偿接收方和争议窗口。
- Earn Vault 首个真实收益协议/链、canonical YD 链、桥接协议与损失/暂停阈值。
- `platform-infrastructure-002`：是否批准推荐的 Cloudflare 原生 R2 + Vectorize + Containers Wave B，或只先批准 R2 + Vectorize。
- 测试网部署、独立审计、主网和生产发布分别由谁批准。

## 非阻塞

- 正式公开 MeshPin/MPIN 前是否需要 PinMe 品牌授权、商标检索和代币符号冲突审查；这不阻塞本地代码使用工作名，但阻塞公开发行表述。
- 加密交付物的密钥交换与灾难恢复由任务双方还是未来的平台密钥服务承担；首版仅记录密钥指纹，不托管明文密钥。
- 生产启用前使用哪一个多签/智能账户作为链上仲裁者；当前测试版按 EOA 验收。
- 新版 `payoutHash` 合约的最终 Sepolia 地址；没有部署凭据时保持现有地址不变。
- 是否进入 Agent 质押、罚没和超时自动释放的合约 v2 阶段；该阶段需要先确定仲裁与资金权限模型。
