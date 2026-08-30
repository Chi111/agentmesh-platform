# pinme-mesh / PinMe IPFS Evidence 独立部署审批包

状态：已按用户批准的拆分流程发布
日期：2026-08-28

## 静态预览记录

- 仅上传已构建的 `frontend/dist`，未上传源码、`.env` 或密钥。
- CID：`bafybeiavuejpxvp3g4abo6sa6i2buzcmg64pl5rg53yjbyci53ntrzt2eq`。
- PinMe Domain：`https://meshpin-agentmesh.pinit.eth.limo`、`https://meshpin-agentmesh.pinme.dev`、`https://mesh-pinme.pinit.eth.limo` 与 `https://mesh-pinme.pinme.dev`。
- HTTP 验证返回 200，`ETag`、`X-Ipfs-Path` 和 `X-Ipfs-Roots` 均指向上述 CID。
- 两个独立 Domain 与 Project 固定域名一样都指向上述 CID，已实际验证一 CID 多 Domain。
- `pinme upload frontend/dist` 会从附近 `pinme.toml` 推断 Project ID 作为上传上下文；随后的 PinMe Domain 绑定请求不携带 Project ID。

## 2026-08-28 拆分发布记录

- 用户批准 `update-db -> update-worker -> pinme upload frontend/dist --domain mesh-pinme`，未运行 `pinme save` 或 `pinme update-web`。
- 发布前门禁：Backend 159/159，Worker dry-run、Frontend build、全量本地 migration、026 重放、SQLite `integrity_check` 和 `git diff --check` 通过。
- `pinme update-db`：26 个 SQL 全部 `COMPLETE`；026 为 6 queries，trace ID `277a2668-e9ea-4a08-9afe-888f80162f32`。
- `pinme update-worker`：deployment ID `f1172fbd43ea4336b18bfb7676fab90f`，startup 36 ms。
- Worker smoke：`/api/health`、`/api/capabilities`、`/api/agents` 和 `/api/yd/config` 均返回 200；公开元数据现统一为 `pinme-mesh Contribution / PM`。
- Web：`mesh-pinme.pinit.eth.limo` 返回 200，`ETag`、`X-Ipfs-Path`、`X-Ipfs-Roots` 均为 CID `bafybeiavuejpxvp3g4abo6sa6i2buzcmg64pl5rg53yjbyci53ntrzt2eq`。
- 当次未部署贡献资产合约，未创建额外服务器/R2/Vectorize/Container，未执行资金操作，也未配置 `IPFS_GATEWAY_BASE`。

## 2026-08-28 PM 品牌发布记录

- 贡献资产公开名称统一为 `pinme-mesh Contribution`，符号统一为 `PM`；`shared/brand.ts` 仍是 UI、Worker API 和未来部署脚本的唯一公开命名源。
- `pinme update-db`：26 个迁移全部 `COMPLETE`，trace ID `65669283-c1cc-4b06-96c0-cb99b1fe7047`。
- `pinme update-worker`：deployment ID `23122d3200bb460ebb89078ba663c6e2`，startup 38 ms。
- `pinme upload frontend/dist --domain mesh-pinme`：CID `bafybeieudondxk56y4txfxmfjb45zr7tuqscfvvbyfgxo7cgmmattzjyxi`。
- `https://mesh-pinme.pinme.dev/` 与 `https://mesh-pinme.pinit.eth.limo/` 均返回 200，并通过 `X-Ipfs-Path` / `X-Ipfs-Roots` 指向上述 CID。
- 两个 Origin 的 `/api/yd/config` GET 均返回精确 `Access-Control-Allow-Origin`，OPTIONS 均返回 204；API 已返回 `pinme-mesh Contribution / PM`。
- 本机没有配置 `SEPOLIA_PRIVATE_KEY`，因此没有提交合约部署交易；Worker 如实返回 `configured: false`。设置安全部署账户后，仍需部署并把地址写入 Worker/前端公开配置，再二次发布。

## 2026-08-28 PM Sepolia 合约记录

- 用户明确授权复用 Web3 大学的 Sepolia 专用测试部署账户；私钥只从其 Git 忽略、权限 `600` 的 `.env` 读取，未复制到本项目、日志或公开配置。
- PM Token：`0xfdf06a468dcc7464c3871057acd863d6bc514bae`，交易 `0x64b398db9857da526eed0849c15d217a02962856c9895bfceef81aef5989f16a`，区块 `11582576`。
- Reward Distributor：`0x852c36af469f0eea10c6aa26cf9489423c7d037e`，交易 `0x443e0cfca5775097859295ca14fff080a53651653bbdf4e2eed87f0238b4388b`，区块 `11582578`。
- Staking / Power：`0x9875e2eabe942dd9f8dd0e7bcb6f36071040a5c2`，交易 `0x4e55de4cd6de621072b90bede9fc3bfdf1132473b47a8cb7b7eb6ab10825bd14`，区块 `11582581`。
- 独立 RPC 复核通过：三个地址均有代码；Token 为 `pinme-mesh Test PM / PM`、18 位、固定供应 1 亿且初始全部归 Treasury；Distributor 和 Staking 均引用该 PM Token；EIP-712 域为 `pinme-mesh PM Power`、chain ID `11155111`。
- 首次跨项目载入整份环境时误复用了 Web3 大学的旧 `YD_TOKEN_ADDRESS`，产生两个未配置、未注资的无效测试合约：Distributor `0xa858734d3838ad2fd5f1fb6edca3180f39dabd48`、Staking `0x3e5fb0a264d7dac0b2515b64a158483f61672a99`。它们不会进入任何运行时配置。部署脚本已修复为显式测试代币模式覆盖旧地址，并拒绝非 `PM` 符号。
- PM 地址接入后的 Worker deployment ID：`60ff024acd5d4c6c8e7e0c888fea9bab`；线上 `/api/yd/config` 返回 `configured: true` 且三个地址完全匹配。
- PM 合约版前端 CID：`bafybeidow42ozjyaicjg2c4m3az2o4y37p3cln5vm5fsvgiitxfyp3xdge`；`mesh-pinme.pinme.dev` 与 `mesh-pinme.pinit.eth.limo` 均已切换到该 CID，GET 为 200，Worker GET/OPTIONS CORS 分别为 200/204。

## 2026-08-28 PM Sepolia 完整冒烟记录

- 用户明确授权执行仅限 Sepolia 的可回收 PM 完整冒烟；签名账户与已配置的测试 Admin/Treasury 一致，私钥未写入本项目或输出。
- 奖励批次：`1787896008`；Treasury 临时注入 `1,000 PM`，批次精确分配并领取 `100 PM`，其余 `900 PM` 回收。
- 锁仓：认证测试账户、批准并锁定 `100 PM / 30 天`，观测原始及委托 Power `10,000,000,000`；随后暂停 Staking、紧急退出并恢复运行。
- 奖励交易：注资 `0x4afdba387b4f017c1781d396f1848f597208b4d13cd41369cf6b6b83b99e10b2`（区块 `11582877`）；发布 `0xe811f1d292a2bd06556df72a1341513ba4550a9fb2e04b6981451a102170f35e`（`11582880`）；领取 `0x393fa5bccf217f34cb221c196f4dd341cb639d7a7a2e8372ae1f1cfbde871d39`（`11582882`）；回收 `0xc4ca2cec8d4c8c5b1994f86253b726e5d00fed9a105461b254655f5032de8400`（`11582884`）。
- Distributor 权限交易：暂停 `0x5708b8b9f793c44da52b5c3e56e085e99614772a7ec1fbeee9f4c65a7c09b40f`（`11582886`）；恢复 `0x7c08e1fc821bf48116cc113facedec8904b5c2615d75ea4c90d79fce3cfb2a26`（`11582889`）。
- Staking 交易：认证 `0x3e2067e65a5342d59977e2e3c296fc9cec3dc923fc9c2b0b7fd10da2ae682dad`（`11582891`）；批准 `0xdc125ed5d9828934fb062083a8317dd00ba81f050af0c40e346c7695bc0254e5`（`11582893`）；锁仓 `0xd28b18639cd3d77ce98efdbfd136ab8658d54d0de8f13d0ffb8cd73be9fe4d66`（`11582895`）；自委托 `0x5678bb81769ce8e03807f6b4a6ae0b80509c681b913a61f5c580912b62d8dc6c`（`11582897`）；暂停 `0xdd774870e21f3b2d2e487faefeb7c0229f8abc71a9321593ce561f1a3fe4fdf6`（`11582899`）；紧急退出 `0x6612a95a7235488c087b3a411d43a5d315a88c87454920db6bcc07c6f0b47c72`（`11582901`）；恢复 `0x957019b40a775033c16a2c8501f0d3b595c0b2bc0ca45b42fb4b2f70a245c827`（`11582903`）。
- 独立公共 RPC 复核：三个合约均有代码且引用同一 PM；批次 `100/100 PM` 已结清；Treasury 持有完整固定供应 `100,000,000 PM`；Distributor/Staking 余额、未结承诺、锁仓、原始 Power 和投票 Power 均为 `0`；两个合约均处于未暂停状态。
- 可重复只读验收命令：`PM_VERIFY_EPOCH=1787896008 npm run verify:pm:sepolia`；该命令不读取私钥、不提交交易。

## CORS 修复记录

- 首次发布验收只检查了无 `Origin` 的公开 API，漏掉新 Domain 的浏览器跨域门禁；线上可精确复现 `403 ORIGIN_NOT_ALLOWED`。
- Worker 默认 CORS 白名单已增加 `mesh-pinme` 和 `meshpin-agentmesh` 的 `.pinit.eth.limo`/`.pinme.dev` 四个入口，并增加 GET/OPTIONS 回归测试。
- 最终修复 Worker deployment ID：`13219c40caee48559774e0c99534a3f8`。
- 线上复验：`mesh-pinme.pinme.dev` Origin GET 返回 200，OPTIONS 返回 204，均返回精确 `Access-Control-Allow-Origin`；`meshpin-agentmesh.pinme.dev` Origin GET 也返回 200。`.pinit.eth.limo` 两个入口同样通过。

## 后续可选范围

- Worker 默认使用固定公共 HTTPS Gateway `https://ipfs.io`；可用 `IPFS_GATEWAY_BASE` 覆盖，Gateway 不可用时证据保持可读并标记为 `unavailable`。
- 如需浏览器内自动绑定新 Domain，PinMe 还需提供正式的 bind-existing-CID CLI/API 和作用域 Token。

## 明确排除

- 不迁移旧 YD 地址、余额或交易；Sepolia PM 测试合约需要单独明确授权。
- 不创建 R2、Vectorize、Containers、服务器、付费 Gateway 或其他外部资源。
- 不上传仓库、`.env`、AppKey、私钥或真实敏感交付文件。
- 除上述已明确授权并回收完成的 Sepolia PM 冒烟外，不执行主网操作、旧资产迁移或额外资金操作。

## 发布前门禁

1. 用户明确批准本审批包或给出更窄范围。
2. 确认当前分支与待发布 commit/diff，重新运行 backend、frontend、Worker dry-run、E2E 和 migration replay。
3. 若配置 Gateway，确认其为固定公共 HTTPS origin、无凭据、无用户可控跳转，并先用非敏感测试 CID 验证。
4. 确认 migration 026 仅新增 companion tables/indexes，旧 deliverables、Escrow 和 YD 表保持不变。
5. 每个新前端 Domain 必须先进入 Worker CORS 白名单；发布后同时验证带 `Origin` 的真实请求和 OPTIONS 预检。

## 发布与回滚

- 全栈发布可使用 `pinme save`。明确批准拆分发布时，必须先 `pinme update-db`、确认全部 migration 成功后再 `pinme update-worker`；Web 只能上传可重建的 `frontend/dist`，绝不上传源码。
- 功能回滚可停止前端入口和 Worker 新写入，旧 legacy deliverables 继续读取；新增表保留以避免丢失已登记 CID/快照。
- Gateway 配置异常时先移除/修正 `IPFS_GATEWAY_BASE`；移除后回退到 `https://ipfs.io`，验证失败不会删除证据历史。
- 合约 metadata 改动只影响未来重新部署；本次发布不包含任何合约地址变更。

## 发布后验收

- Worker health 与 capabilities 为 200，migration 026 四张表存在。
- Legacy URI 交付仍可读取；PinMe Manifest 可提交为 v1/v2/v3，错误 CID/hash/parent 被拒绝。
- 验收快照、纠纷快照、审核档案 hash、Agent CID 履历与角色权限符合本地 QA。
- 公开页面只显示 pinme-mesh Contribution / PM，并保留“非 PinMe 官方代币”说明。
