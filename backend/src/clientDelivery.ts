import type { DeliverableManifest } from './contracts';
import { canonicalJson, sha256Json } from './ipfsEvidence';
import type { PinmeBundleFile } from './pinmeUpload';
import { renderMarkdown } from '../../shared/markdown';

const encoder = new TextEncoder();

export interface ClientDeliveryArtifactReference {
  name: string;
  uri: string;
  contentHash: string;
  mimeType: string;
  stageName: string;
}

export interface ClientDeliveryWorkstream {
  position: number;
  stageId: string;
  stageName: string;
  purpose: string;
  executionMode: string;
  agentName: string;
  markdown: string;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function safePathSegment(value: string): string {
  const normalized = value.normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || 'stage';
}

function artifactIndexMarkdown(artifacts: ClientDeliveryArtifactReference[]): string {
  const lines = ['# 真实制品索引', '', '以下是工作流实际提交并纳入当前成果包的制品引用。哈希用于核对内容，链接用于获取成品。', ''];
  if (!artifacts.length) return [...lines, '本任务没有额外的二进制或外部工程制品。'].join('\n');
  artifacts.forEach((artifact, index) => {
    lines.push(
      `## ${index + 1}. ${artifact.name}`,
      '',
      `- 阶段：${artifact.stageName}`,
      `- 类型：${artifact.mimeType}`,
      `- 内容哈希：\`${artifact.contentHash}\``,
      `- 获取地址：${artifact.uri}`,
      '',
    );
  });
  return lines.join('\n');
}

function acceptanceReportMarkdown(criteria: Record<string, unknown>, criteriaSha256: string): string {
  const lines = ['# 验收标准与覆盖边界', '', `验收标准指纹：\`${criteriaSha256}\``, ''];
  if (typeof criteria.text === 'string' && criteria.text.trim()) {
    lines.push('## 当前变更后的验收要求', '', criteria.text.trim(), '');
  }
  if (Array.isArray(criteria.stages)) {
    lines.push('## 工作流验收项', '');
    criteria.stages.forEach((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const stage = value as Record<string, unknown>;
      const name = typeof stage.name === 'string' ? stage.name : `阶段 ${index + 1}`;
      const purpose = typeof stage.purpose === 'string' ? stage.purpose : '按阶段输出契约完成工作。';
      lines.push(`${index + 1}. **${name}**：${purpose}`);
    });
    lines.push('');
  }
  lines.push('## 核对说明', '', '- 最终验收应同时核对最终成品、分阶段底稿和真实制品索引。', '- Manifest 与 CID 用于证明本成果包版本未被覆盖，不替代业务质量判断。');
  return lines.join('\n');
}

function documentHtml(input: {
  title: string;
  missionTitle: string;
  stageName: string;
  agentName: string;
  createdAt: string;
  markdown: string;
  workstreams: ClientDeliveryWorkstream[];
  artifacts: ClientDeliveryArtifactReference[];
}): string {
  const complex = input.workstreams.length > 0;
  const workstreamHtml = input.workstreams.map((workstream, index) => `<section class="workstream" id="stage-${index + 1}"><div class="workstream-head"><span>${String(index + 1).padStart(2, '0')}</span><div><h2>${escapeHtml(workstream.stageName)}</h2><p>${escapeHtml(workstream.purpose)}</p></div><b>${escapeHtml(workstream.executionMode)}</b></div><div class="stage-meta">${escapeHtml(workstream.agentName)} · 阶段工作底稿</div><div class="markdown-body">${renderMarkdown(workstream.markdown)}</div></section>`).join('\n');
  const artifactHtml = input.artifacts.length
    ? `<section id="artifacts"><h2>真实制品索引</h2><div class="artifact-grid">${input.artifacts.map((artifact) => `<article class="artifact"><b>${escapeHtml(artifact.name)}</b><span>${escapeHtml(artifact.stageName)} · ${escapeHtml(artifact.mimeType)}</span><code>${escapeHtml(artifact.contentHash)}</code><p>${escapeHtml(artifact.uri)}</p></article>`).join('')}</div></section>`
    : '';
  const navigationHtml = complex
    ? `<nav class="package-nav" aria-label="成果包目录"><a href="#deliverable">最终成果</a>${input.workstreams.map((workstream, index) => `<a href="#stage-${index + 1}">${String(index + 1).padStart(2, '0')} ${escapeHtml(workstream.stageName)}</a>`).join('')}${input.artifacts.length ? '<a href="#artifacts">真实制品</a>' : ''}</nav>`
    : '';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.title)}</title><style>
:root{color-scheme:light;--ink:#10181d;--muted:#68767d;--cyan:#16b6c9;--line:#dbe4df;--paper:#fbfcf8;--lime:#c8f568;--yellow:#ffd66b}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:linear-gradient(145deg,#e9f6f4,#f6f3de 60%,#fbe8e8);color:var(--ink);font:16px/1.75 ui-sans-serif,system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}.shell{width:min(1120px,calc(100% - 28px));margin:36px auto}.brand{display:flex;align-items:center;gap:10px;margin-bottom:18px;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.mark{width:12px;height:12px;border-radius:3px;background:var(--cyan);box-shadow:17px 0 0 var(--lime)}main>article{overflow:hidden;border:1px solid rgba(16,24,29,.12);border-radius:24px;background:rgba(255,255,255,.92);box-shadow:0 24px 80px rgba(29,55,60,.13)}header{padding:44px 48px 34px;border-bottom:1px solid var(--line);background:radial-gradient(circle at 90% 0,rgba(22,182,201,.17),transparent 35%)}h1{margin:0;font-size:clamp(30px,5vw,52px);line-height:1.15;letter-spacing:-.035em}.meta{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:20px;color:var(--muted);font-size:13px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:26px}.metric{padding:14px;border:1px solid rgba(16,24,29,.1);border-radius:14px;background:rgba(255,255,255,.72)}.metric b{display:block;font-size:24px}.metric span{font-size:11px;color:var(--muted)}.package-nav{display:flex;gap:8px;overflow:auto;padding:16px 48px;border-bottom:1px solid var(--line);background:#f8faf8}.package-nav a{flex:none;border:1px solid var(--line);border-radius:999px;background:#fff;padding:6px 12px;color:var(--ink);font-size:11px;font-weight:700;text-decoration:none}.package-nav a:hover,.package-nav a:focus{border-color:var(--cyan);color:#087f8c;outline:none}.content{padding:38px 48px 48px}.content h2,.content h3,.content h4{margin:1.4em 0 .55em;line-height:1.3}.content h2{font-size:26px}.content h3{font-size:21px}.content p{margin:.7em 0}.content li{margin:.45em 0}.content code{padding:.14em .4em;border-radius:5px;background:#edf3f1;font:14px ui-monospace,SFMono-Regular,Menlo,monospace}.divider{height:1px;margin:44px 0;background:var(--line)}.workstream{scroll-margin-top:20px;margin-top:28px;padding:28px;border:1px solid var(--line);border-radius:20px;background:#fff}.workstream-head{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:start}.workstream-head>span{display:grid;width:42px;height:42px;place-items:center;border-radius:12px;background:var(--ink);color:#fff;font:700 12px ui-monospace,monospace}.workstream-head h2{margin:0}.workstream-head p{margin:4px 0 0;color:var(--muted);font-size:13px}.workstream-head b{border-radius:999px;background:#e7f8f9;padding:5px 9px;color:#087f8c;font-size:10px;text-transform:uppercase}.stage-meta{margin:14px 0;color:var(--muted);font-size:11px}.artifact-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.artifact{display:flex;min-width:0;flex-direction:column;gap:7px;padding:16px;border:1px solid var(--line);border-radius:14px;background:#f8faf8}.artifact span,.artifact p{margin:0;color:var(--muted);font-size:11px}.artifact code{overflow:hidden;text-overflow:ellipsis;font-size:10px}footer{padding:18px 48px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}.proof{color:#087f8c;font-weight:700}@media(max-width:640px){.shell{margin:14px auto}header,.content{padding:28px 24px}.package-nav{padding:12px 24px}.metrics{grid-template-columns:1fr}.artifact-grid{grid-template-columns:1fr}.workstream{padding:20px}.workstream-head{grid-template-columns:auto 1fr}.workstream-head b{grid-column:2}footer{padding:16px 24px}}
.markdown-body{min-width:0;overflow-wrap:anywhere}.markdown-body p{margin:.75em 0}.markdown-body ul,.markdown-body ol{padding-left:1.5rem}.markdown-body li{margin:.45em 0}.markdown-body a{color:#087f8c;font-weight:650;text-decoration-thickness:1px;text-underline-offset:3px}.markdown-body blockquote{margin:1rem 0;border-left:4px solid var(--cyan);border-radius:0 10px 10px 0;background:#eff8f7;padding:.65rem 1rem;color:#53646b}.markdown-body hr{height:1px;margin:2rem 0;border:0;background:var(--line)}.markdown-body code{padding:.14em .4em;border-radius:5px;background:#edf3f1;font:14px ui-monospace,SFMono-Regular,Menlo,monospace}.markdown-body pre{overflow:auto;border:1px solid #26343a;border-radius:12px;background:#11191e;padding:16px;color:#dce9e8}.markdown-body pre code{padding:0;background:transparent;color:inherit}.markdown-body table{display:block;width:100%;overflow-x:auto;border-collapse:collapse;margin:1.25rem 0;font-size:13px}.markdown-body th,.markdown-body td{min-width:120px;border:1px solid var(--line);padding:9px 11px;text-align:left;vertical-align:top}.markdown-body th{background:#eaf5f3;font-weight:750}.markdown-body tr:nth-child(even) td{background:#f8faf8}.markdown-body img{display:block;max-width:100%;height:auto;margin:1rem auto;border-radius:12px}
</style></head><body><main class="shell"><div class="brand"><span class="mark"></span><span>PinMe-Mesh ${complex ? 'Mission Package' : 'Stage Delivery'}</span></div><article><header><h1>${escapeHtml(input.title)}</h1><div class="meta"><span>项目：${escapeHtml(input.missionTitle)}</span><span>阶段：${escapeHtml(input.stageName)}</span><span>Agent：${escapeHtml(input.agentName)}</span><span>${escapeHtml(new Date(input.createdAt).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }))}</span></div>${complex ? `<div class="metrics"><div class="metric"><b>${input.workstreams.length}</b><span>已汇总工作阶段</span></div><div class="metric"><b>${input.artifacts.length}</b><span>真实制品引用</span></div><div class="metric"><b>1</b><span>不可变成果版本</span></div></div>` : ''}</header>${navigationHtml}<section class="content"><section class="markdown-body" id="deliverable">${renderMarkdown(input.markdown)}</section>${complex ? `<div class="divider"></div><h2>分阶段成果与依据</h2>${workstreamHtml}${artifactHtml}` : ''}</section><footer><span class="proof">PinMe / IPFS 不可变版本</span> · 技术 JSON 仅用于后台校验，不属于客户成品正文。</footer></article></main></body></html>`;
}

export async function buildClientDeliveryBundle(input: {
  missionId: string;
  missionTitle: string;
  stageId: string;
  stageName: string;
  attemptNo: number;
  agentId: string;
  agentName: string;
  logicalName: string;
  title: string;
  deliverableMarkdown: string;
  acceptanceCriteriaSha256: string;
  acceptanceCriteria?: Record<string, unknown>;
  workstreams?: ClientDeliveryWorkstream[];
  artifactReferences?: ClientDeliveryArtifactReference[];
  versionNo: number;
  supersedesRootCid: string | null;
  createdAt: string;
}): Promise<{
  contentHash: string;
  manifest: DeliverableManifest;
  manifestSha256: string;
  files: PinmeBundleFile[];
}> {
  const markdown = input.deliverableMarkdown.trim();
  if (!markdown) throw new Error('Client delivery Markdown is empty');
  const workstreams = [...(input.workstreams ?? [])].sort((left, right) => left.position - right.position);
  const artifacts = input.artifactReferences ?? [];
  const html = documentHtml({
    title: input.title, missionTitle: input.missionTitle, stageName: input.stageName,
    agentName: input.agentName, createdAt: input.createdAt, markdown, workstreams, artifacts,
  });
  const contentFiles: PinmeBundleFile[] = [{ path: 'deliverable.md', content: markdown }];
  if (workstreams.length > 0) {
    contentFiles.push({
      path: 'acceptance-report.md',
      content: acceptanceReportMarkdown(input.acceptanceCriteria ?? {}, input.acceptanceCriteriaSha256),
    });
    contentFiles.push({ path: 'artifact-index.md', content: artifactIndexMarkdown(artifacts) });
    workstreams.forEach((workstream, index) => contentFiles.push({
      path: `workstreams/${String(index + 1).padStart(2, '0')}-${safePathSegment(workstream.stageName)}.md`,
      content: workstream.markdown,
    }));
  }
  contentFiles.push({ path: 'index.html', content: html });
  const manifestFiles = await Promise.all(contentFiles.map(async (file) => {
    const content = typeof file.content === 'string' ? file.content : new TextDecoder().decode(file.content);
    const mimeType = file.path.endsWith('.html') ? 'text/html' : 'text/markdown';
    return { path: file.path, sha256: await sha256Text(content), mimeType, byteSize: encoder.encode(content).byteLength };
  }));
  const manifest: DeliverableManifest = {
    schema: 'agentmesh.deliverable-manifest.v1',
    missionId: input.missionId,
    stageId: input.stageId,
    attemptNo: input.attemptNo,
    agentId: input.agentId,
    logicalName: input.logicalName,
    versionNo: input.versionNo,
    supersedesRootCid: input.supersedesRootCid,
    acceptanceCriteriaSha256: input.acceptanceCriteriaSha256,
    createdAt: input.createdAt,
    generator: workstreams.length > 0 ? 'agentmesh.pinme-complex-delivery.v2' : 'agentmesh.pinme-auto-delivery.v1',
    files: manifestFiles,
  };
  return {
    contentHash: await sha256Text(markdown),
    manifest,
    manifestSha256: await sha256Json(manifest),
    files: [...contentFiles, { path: 'manifest.json', content: canonicalJson(manifest) }],
  };
}
