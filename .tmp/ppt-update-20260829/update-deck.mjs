import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const source = "/Users/mac/workcode/agentmesh-platform/.tmp/ppt-update-20260829/template-starter.pptx";
const output = "/Users/mac/workcode/agentmesh-platform/docs/pinme-mesh-demo-20260829.pptx";

const presentation = await PresentationFile.importPptx(await FileBlob.load(source));

function setText(anchorId, value) {
  const shape = presentation.resolve(anchorId);
  if (!shape) throw new Error(`Missing inherited textbox: ${anchorId}`);
  shape.text = value;
}

const footer = "pinme-mesh · PRODUCT DEMO · 2026-08-29";

// Slide 1 — current production evidence.
setText("sh/vax03mlw", "bafybeig…kakiu4");
setText("sh/gb61w72h", footer);

// Slide 2 — preserve thesis, synchronize report date.
setText("sh/fypcfqdg", footer);

// Slide 3 — exact verified six-step mission, followed by delivery and settlement.
setText("sh/d0jax03i", "AI 编排 6 步，就按 6 步执行");
setText("sh/298ryl4v", "任务 TASK-2026-CA9B17：3 个角色 Agent 按依赖协作，随后自动生成可验收成果包。");
setText("sh/m5cra54z", "目标拆解");
setText("sh/n6ls3alk", "Strategy Analyst");
setText("sh/v6l4jq94", "证据研究");
setText("sh/a5c3ql8z", "Evidence Scout");
setText("sh/e10f2twf", "核心交付");
setText("sh/f29gbyx0", "Delivery Writer");
setText("sh/sfix03y9", "发布准备");
setText("sh/tgry9ofu", "Evidence Scout");
setText("sh/z2d07mh4", "策略决策");
setText("sh/y14jehgj", "Strategy Analyst");
setText("sh/ax4zax0n", "独立复核");
setText("sh/hwzihwzi", "Delivery Writer");
setText("sh/32l0j2dw", "PinMe 自动交付");
setText("sh/cruhwrud", "5 条工作流 → 9 文件");
setText("sh/1wnitwvu", "Markdown 验收");
setText("sh/v29cfu18", "客户可读成果包");
setText("sh/mxgb250r", "结算/争议");
setText("sh/90rudkji", "释放或冻结二选一");
setText("sh/3qxwfilo", "贡献沉淀");
setText("sh/or6x8329", "履约信誉、PM 与 Power");
setText("sh/dgfyls3q", footer);

// Slide 4 — honest role-runtime and key-management boundaries.
setText("sh/i1sni5wv", "三位内置 Agent 共享 PinMe LLM；差异来自角色提示词、上下文与输出契约。");
setText("sh/wf61krul", "3 Role Agents + PinMe LLM");
setText("sh/jixkf6tw", "gpt-5.6-sol · Strategy / Evidence / Delivery · 结构化输出");
setText("sh/tkzi1wry", "用户 PinMe AppKey 在 D1 加密；仅 Worker 解密并上传，前端永不接触。");
setText("sh/9k3qpory", "LLM 输出不合法即失败/重试；兜底 JSON 不作为交付物。");
setText("sh/8ju9gjad", footer);

// Slides 5–6 — preserve product visuals, synchronize report date.
setText("sh/pkr6tgjy", footer);
setText("sh/1k3mhozu", footer);

// Slide 7 — automatic, multi-file, customer-readable PinMe delivery.
setText("sh/xwvqlwv2", "PinMe/IPFS 把复杂任务变成客户可读、可核对的成果包");
setText("sh/zmlkne1w", "任务结束即自动上传：5 条工作流汇总为 9 个文件，并由根 CID 固化版本。");
setText("sh/by1kje1k", "阶段产物");
setText("sh/qxsja90f", "5 workstreams");
setText("sh/dk32lojq", "策略与研究\n分阶段 Markdown\n节点输出可追溯");
setText("sh/rqhkrulg", "任务汇总");
setText("sh/srqlkz21", "9 files");
setText("sh/tsj2t43m", "执行摘要\n成果正文\n证据与审阅附件");
setText("sh/2hs3q9k3", "最终交付");
setText("sh/3i1kzelo", "bafy…ogymq");
setText("sh/dcn6p8nq", "客户打开即读\nMarkdown 渲染\n版本不可覆盖");
setText("sh/lgn6tsn2", "任务 TASK-2026-CA9B17 的 4/4 当前交付已核验；验收、复核与纠纷统一对照根 CID。");
setText("sh/ydwnyd4b", "Worker 自动上传");
setText("sh/9k76xsny", "任务结束即调用 PinMe");
setText("sh/g7uxkfm5", "用户配置 AppKey");
setText("sh/h83yt03a", "D1 加密，仅 Worker 解密");
setText("sh/f6lgralk", "成果可读");
setText("sh/8jaxgvmt", "Markdown 渲染 + 内部滚动");
setText("sh/6hsfel4n", "公共证据");
setText("sh/7i1gnql8", "CID 公开、不可覆盖");
setText("sh/kfaxcvmx", footer);

// Slide 8 — preserve Web3 model, synchronize report date.
setText("sh/pwjqho7u", footer);

// Slide 9 — report-ready walkthrough and verified release checks.
setText("sh/8rytoveh", "汇报演示：6 分钟看完复杂任务闭环");
setText("sh/y1cz2x83", "从 AI 编排 6 步开始，展示 3 个角色 Agent、自动 PinMe 交付与 Markdown 验收。");
setText("sh/lo3ixcru", "创建任务");
setText("sh/mpcj6x8f", "目标、预算与验收标准");
setText("sh/9sni1crq", "AI 编排");
setText("sh/2tszud8v", "6 步依赖图如实展示");
setText("sh/6xof29on", "3 个角色");
setText("sh/t0fyxo7e", "Strategy · Evidence · Delivery");
setText("sh/i94fypor", "3D 办公区");
setText("sh/5cfet472", "工位、状态与空间动作");
setText("sh/258fatov", "自动交付");
setText("sh/kb2d4vmd", "Worker 上传成果包到 PinMe");
setText("sh/za9cvq5s", "验收查看");
setText("sh/8f2d8vmp", "Markdown / 滚动 / CID 核对");
setText("sh/54jqt4by", "前端生产构建通过");
setText("sh/i1s7ips7", "后端测试 189 / 189 通过");
setText("sh/vyhonutw", "真实任务：6 步 / 3 Agent 完整执行");
setText("sh/8bqpcfa5", "交付核验：4 / 4，成果包共 9 个文件");
setText("sh/0365ovq9", "线上 CORS：GET 200 / OPTIONS 204");
setText("sh/dgvmtgri", "多模型路由");
setText("sh/3ad4n69g", "第三方工具 Agent");
setText("sh/hkna50ry", "3D 状态回放");
setText("sh/uhwru58n", "当前仍是 Sepolia 测试网演示版，不包含主网、真实法币、私密 IPFS 或自动代签结算。");
setText("sh/vi5s3a98", footer);

const notes = [
  [
    "汇报提示：先强调 pinme-mesh 不是聊天机器人，而是复杂任务从编排到可验证交付的闭环。",
    "[Sources]",
    "- https://mesh-pinme.pinme.dev/ — live app, verified 2026-08-29",
    "- Frontend CID: bafybeigopgicedclvho7q3g4sx7nabxeukoevnyvgvj7endebdcqkakiu4",
    "[/Sources]",
  ],
  [
    "汇报提示：用‘目标—编排—执行—证据—结算’五段解释平台初衷。",
    "[Sources]",
    "- https://mesh-pinme.pinme.dev/ — implemented product flow",
    "[/Sources]",
  ],
  [
    "汇报提示：这页要明确 AI 编排多少步，产品就展示并执行多少步；当前真实任务是 6 步。",
    "[Sources]",
    "- Mission TASK-2026-CA9B17 — production smoke mission, verified 2026-08-29",
    "- https://688355bf.pinme.dev/ — final mission package",
    "[/Sources]",
  ],
  [
    "汇报提示：三位 Agent 不是三套模型，而是同一 PinMe LLM 上的三种专业角色运行时。",
    "[Sources]",
    "- /Users/mac/workcode/agentmesh-platform/backend/src/worker.ts — role prompts, LLM calls, delivery and key boundaries",
    "- /Users/mac/workcode/agentmesh-platform/docs/worker_service_api.md — PinMe worker service API conventions",
    "[/Sources]",
  ],
  [
    "汇报提示：Agent 市场展示能力准入和可用性，不只展示头像或文案。",
    "[Sources]",
    "- https://mesh-pinme.pinme.dev/ — live Agent market",
    "[/Sources]",
  ],
  [
    "汇报提示：3D 模块是任务状态的数字孪生表达，工作中回工位，空闲时在空间内活动。",
    "[Sources]",
    "- https://mesh-pinme.pinme.dev/ — live 3D workspace",
    "[/Sources]",
  ],
  [
    "汇报提示：客户收到的是可直接阅读的成果包链接，不是要求其处理一段 JSON。",
    "[Sources]",
    "- https://688355bf.pinme.dev/ — final package, 9 files",
    "- Package CID: bafybeiasx23e4dqxfim6v5ahmgehswwwfdcw3az34dwiui26erwoyogymq",
    "- Mission TASK-2026-CA9B17 — 4/4 current deliverables verified",
    "[/Sources]",
  ],
  [
    "汇报提示：PM 是测试网贡献与治理品牌，不是 PinMe 官方代币，也不承诺价格或收益。",
    "[Sources]",
    "- https://mesh-pinme.pinme.dev/ — live PM center and Sepolia demo",
    "[/Sources]",
  ],
  [
    "汇报提示：按左侧 6 个步骤现场演示；右侧只陈述已经验证的结果。",
    "[Sources]",
    "- https://mesh-pinme.pinme.dev/ — live app",
    "- https://688355bf.pinme.dev/ — final mission package",
    "- Backend regression suite: 189/189 passing, verified 2026-08-29",
    "- Worker deployment: a58ff43ac3a0440988bdbc90f79095fe",
    "[/Sources]",
  ],
];

presentation.slides.items.forEach((slide, index) => {
  slide.speakerNotes.textFrame.setText(notes[index]);
  slide.speakerNotes.setVisible(true);
});

const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(output);
console.log(JSON.stringify({ output, slideCount: presentation.slides.items.length }));
