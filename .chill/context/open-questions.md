# Open Questions

## 后续独立 Gate

- Agent 保证金使用何种资产、比例、罚没证据、补偿接收方和争议窗口。
- Earn Vault 首个真实收益协议/链、canonical YD 链、桥接协议与损失/暂停阈值。
- `platform-infrastructure-002`：是否批准推荐的 Cloudflare 原生 R2 + Vectorize + Containers Wave B，或只先批准 R2 + Vectorize。
- 独立审计、主网和正式经济模型分别由谁批准；Sepolia PM 测试部署与冒烟已经完成。

## 非阻塞

- 主网公开发行 pinme-mesh/PM 前是否需要 PinMe 品牌授权、商标检索和代币符号冲突审查；当前仅为明确标注非官方背书的 Sepolia 测试资产。
- 加密交付物的密钥交换与灾难恢复由任务双方还是未来的平台密钥服务承担；首版仅记录密钥指纹，不托管明文密钥。
- 生产启用前使用哪一个多签/智能账户作为链上仲裁者；当前测试版按 EOA 验收。
- 新版 `payoutHash` 合约的最终 Sepolia 地址；没有部署凭据时保持现有地址不变。
- 是否进入 Agent 质押、罚没和超时自动释放的合约 v2 阶段；该阶段需要先确定仲裁与资金权限模型。
