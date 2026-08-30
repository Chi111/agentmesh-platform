import { FileBlob, PresentationFile } from "@oai/artifact-tool";
import fs from "node:fs/promises";

const source = "/Users/mac/workcode/agentmesh-platform/.tmp/roadshow-20260830/ppt/template-starter.pptx";
const output = "/Users/mac/workcode/agentmesh-platform/docs/pinme-mesh-roadshow-20260830.pptx";
const presentation = await PresentationFile.importPptx(await FileBlob.load(source));

function setText(anchorId, value) {
  const shape = presentation.resolve(anchorId);
  if (!shape) throw new Error(`Missing inherited textbox: ${anchorId}`);
  shape.text = value;
}

async function replaceImage(anchorId, path, alt, crop) {
  const image = presentation.resolve(anchorId);
  if (!image) throw new Error(`Missing inherited image: ${anchorId}`);
  const oldFrame = image.frame;
  const oldFit = image.fit;
  const oldGeometry = image.geometry;
  const oldBorderRadius = image.borderRadius;
  const oldRotation = image.rotation;
  const oldFlipHorizontal = image.flipHorizontal;
  const oldFlipVertical = image.flipVertical;
  const oldLockAspectRatio = image.lockAspectRatio;
  const bytes = await fs.readFile(path);
  const blob = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  image.replace({
    blob,
    contentType: "image/png",
    alt,
    fit: oldFit || "cover",
  });
  image.frame = oldFrame;
  image.crop = crop;
  image.geometry = oldGeometry;
  image.borderRadius = oldBorderRadius;
  image.rotation = oldRotation;
  image.flipHorizontal = oldFlipHorizontal;
  image.flipVertical = oldFlipVertical;
  image.lockAspectRatio = oldLockAspectRatio;
}

await replaceImage(
  "im/biho7el8",
  "/Users/mac/workcode/agentmesh-platform/.tmp/roadshow-20260830/screenshots/dashboard.png",
  "pinme-mesh 当前任务方工作台：复杂目标、运行指标与实时任务拓扑",
  { left: 0.05, right: 0.05, top: 0, bottom: 0 },
);
await replaceImage(
  "im/8j2x8b6t",
  "/Users/mac/workcode/agentmesh-platform/.tmp/roadshow-20260830/screenshots/agent-market.png",
  "pinme-mesh 当前 Agent 市场：Evidence Scout、Strategy Analyst 与 Delivery Writer",
  { left: 0.05, right: 0.05, top: 0, bottom: 0 },
);
await replaceImage(
  "im/tob6lc7u",
  "/Users/mac/workcode/agentmesh-platform/.tmp/roadshow-20260830/screenshots/agent-office-system.png",
  "pinme-mesh 当前 3D Agent 数字孪生办公区",
  { left: 0.154, right: 0.014, top: 0.165, bottom: 0 },
);

const footer = "pinme-mesh · PRODUCT DEMO · 2026-08-30";
setText("sh/vax03mlw", "bafybeih…kuiy5u");
[
  "sh/gb61w72h", "sh/fypcfqdg", "sh/dgfyls3q", "sh/8ju9gjad", "sh/pkr6tgjy",
  "sh/1k3mhozu", "sh/kfaxcvmx", "sh/pwjqho7u", "sh/vi5s3a98",
].forEach((anchorId) => setText(anchorId, footer));

const notes = [
  [
    "汇报提示：先强调 pinme-mesh 不是聊天机器人，而是复杂任务从编排到可验证交付的闭环。",
    "[Sources]",
    "- https://mesh-pinme.pinme.dev/ — live app and dashboard, verified 2026-08-30",
    "- Frontend CID: bafybeihuewiymgcgotoncbiya6hove5qtqgvaakb4dapxmsuyinykuiy5u",
    "[/Sources]",
  ],
  [
    "汇报提示：用‘目标—编排—执行—证据—结算’五段解释平台初衷。",
    "[Sources]",
    "- /Users/mac/workcode/agentmesh-platform/docs/prd.md — implemented product flow",
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
    "- https://mesh-pinme.pinme.dev/#/agents — live Agent market, verified 2026-08-30",
    "[/Sources]",
  ],
  [
    "汇报提示：3D 模块是任务状态的数字孪生表达，工作中回工位，空闲时在空间内活动。",
    "[Sources]",
    "- https://mesh-pinme.pinme.dev/#/developer/agents — live 3D workspace, verified 2026-08-30",
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
    "- /Users/mac/workcode/agentmesh-platform/docs/prd.md — PM product boundary",
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
