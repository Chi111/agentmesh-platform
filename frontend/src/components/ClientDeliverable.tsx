import { AlertTriangle, Check, Code2, Copy, Download, ExternalLink, FileStack, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { renderMarkdown } from '../../../shared/markdown';

interface ClientDeliverableProps {
  title: string;
  stageName?: string;
  attemptNo: number;
  result: unknown;
  source: string | null;
  sourceUri: string;
  isMissionPackage?: boolean;
  fileCount?: number;
  workstreamCount?: number;
  packageSections?: Array<{
    id: string;
    name: string;
    purpose: string;
    mode: string;
    summary: string;
    artifactCount: number;
  }>;
}

const FIELD_LABELS: Record<string, string> = {
  executiveSummary: '交付摘要', summary: '交付摘要', deliverable: '成品正文', body: '成品正文',
  content: '成品正文', copy: '文案成品', script: '脚本成品', narrative: '成品正文', markdown: '成品正文',
  findings: '核心结论', recommendation: '交付建议', recommendations: '交付建议', risks: '风险与注意事项',
  limitations: '限制说明', actionList: '后续行动', actions: '后续行动', nextSteps: '后续行动',
  validationPlan: '验证方案', options: '备选方案', audience: '目标受众', channels: '发布渠道',
};

const TITLE_KEYS = new Set(['title', 'headline', 'name']);
const HIDDEN_KEYS = new Set(['completionStatus', 'verified', 'status']);
const PRIORITY_KEYS = [
  'deliverable', 'body', 'content', 'copy', 'script', 'narrative', 'markdown',
  'executiveSummary', 'summary', 'findings', 'recommendation', 'recommendations',
  'audience', 'channels', 'actionList', 'actions', 'nextSteps', 'validationPlan',
  'limitations', 'risks', 'options',
];

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function scalarText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function humanizeKey(key: string): string {
  return FIELD_LABELS[key]
    ?? key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
}

function displayTitle(result: unknown, fallback: string): string {
  const record = objectValue(result);
  if (!record) return fallback;
  for (const key of TITLE_KEYS) {
    const candidate = scalarText(record[key]);
    if (candidate) return candidate;
  }
  return fallback;
}

function orderedEntries(record: Record<string, unknown>): Array<[string, unknown]> {
  const priority = new Map(PRIORITY_KEYS.map((key, index) => [key, index]));
  return Object.entries(record)
    .filter(([key, value]) => !TITLE_KEYS.has(key) && !HIDDEN_KEYS.has(key) && value !== null && value !== undefined)
    .sort(([left], [right]) => (priority.get(left) ?? 999) - (priority.get(right) ?? 999));
}

function markdownValue(value: unknown, depth = 0): string {
  const text = scalarText(value);
  if (text) return text;
  if (Array.isArray(value)) return value.map((item) => `- ${markdownValue(item, depth + 1).replace(/\n/g, '\n  ')}`).join('\n');
  const record = objectValue(value);
  if (!record) return '';
  return orderedEntries(record).map(([key, nested]) => `${'#'.repeat(Math.min(3, depth + 2))} ${humanizeKey(key)}\n\n${markdownValue(nested, depth + 1)}`).join('\n\n');
}

function clientMarkdown(result: unknown, title: string): string {
  const record = objectValue(result);
  if (!record) return `# ${title}\n\n${markdownValue(result)}`;
  return `# ${displayTitle(result, title)}\n\n${orderedEntries(record).map(([key, value]) => `## ${humanizeKey(key)}\n\n${markdownValue(value)}`).join('\n\n')}`;
}

export function ClientDeliverable({
  title, stageName, attemptNo, result, source, sourceUri,
  isMissionPackage = false, fileCount = 0, workstreamCount = 0, packageSections = [],
}: ClientDeliverableProps) {
  const [copied, setCopied] = useState(false);
  const isFallback = source === 'deterministic-fallback';
  const documentTitle = displayTitle(result, title);
  const markdown = useMemo(() => clientMarkdown(result, documentTitle), [documentTitle, result]);
  const renderedMarkdown = useMemo(() => renderMarkdown(markdown), [markdown]);

  const copyDocument = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  const downloadDocument = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${documentTitle.replace(/[\\/:*?\"<>|]/g, '-').slice(0, 80) || '交付稿'}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div className="client-deliverable flex min-h-0 flex-col overflow-hidden p-5 md:p-7">
    <div className="flex shrink-0 flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan">{isMissionPackage ? <FileStack size={14} /> : <FileText size={14} />}{isMissionPackage ? '复杂任务完整成果包' : '阶段客户制品'}</p><h3 className="mt-2 text-xl font-semibold text-white">{documentTitle}</h3><p className="mt-2 text-[10px] text-white/40">{stageName ?? title} · 第 {attemptNo} 次执行</p></div>
      {!isFallback ? <div className="flex shrink-0 flex-wrap gap-2"><a className="inline-flex items-center gap-2 rounded-lg bg-cyan px-3 py-2 text-xs font-semibold text-ink hover:brightness-105" href={sourceUri} target="_blank" rel="noreferrer"><ExternalLink size={14} />{isMissionPackage ? '打开完整成果包' : '打开 PinMe 制品'}</a><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10" onClick={() => void copyDocument()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? '已复制' : '复制成品'}</button><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10" onClick={downloadDocument}><Download size={14} />下载主报告</button></div> : null}
    </div>

    <div
      className="delivery-scroll-panel min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2 md:pr-3"
      role="region"
      aria-label="成果内容，可上下滚动查看"
      tabIndex={0}
    >
      {isMissionPackage ? <div className="mt-5 grid grid-cols-3 gap-3"><div className="rounded-xl border border-white/10 bg-white/[0.04] p-4"><p className="font-mono text-xl font-semibold text-cyan">{workstreamCount}</p><p className="mt-1 text-[10px] text-white/40">阶段工作底稿</p></div><div className="rounded-xl border border-white/10 bg-white/[0.04] p-4"><p className="font-mono text-xl font-semibold text-lime">{fileCount}</p><p className="mt-1 text-[10px] text-white/40">不可变成果文件</p></div><div className="rounded-xl border border-white/10 bg-white/[0.04] p-4"><p className="font-mono text-xl font-semibold text-warning">1</p><p className="mt-1 text-[10px] text-white/40">统一验收入口</p></div></div> : null}

      {isMissionPackage && packageSections.length > 0 ? <section className="mt-6"><div className="flex items-center justify-between gap-3"><h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">成果包目录</h4><span className="font-mono text-[9px] text-white/30">{packageSections.length} WORKSTREAMS SYNTHESIZED</span></div><div className="mt-3 grid gap-3 md:grid-cols-2">{packageSections.map((section, index) => <article className="rounded-xl border border-white/10 bg-white/[0.035] p-4" key={section.id}><div className="flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan/15 font-mono text-[10px] font-semibold text-cyan">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-white">{section.name}</p><span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[8px] uppercase text-white/45">{section.mode}</span></div><p className="mt-1 text-[10px] leading-5 text-white/35">{section.purpose}</p></div></div><p className="mt-3 line-clamp-3 text-xs leading-5 text-white/60">{section.summary}</p><p className="mt-3 font-mono text-[9px] text-white/30">{section.artifactCount} ARTIFACTS</p></article>)}</div></section> : null}

      {isFallback ? <div className="mt-5 rounded-xl border border-warning/35 bg-warning/10 p-5"><p className="flex items-center gap-2 text-sm font-semibold text-warning"><AlertTriangle size={17} />本次没有生成可交付成品</p><p className="mt-2 text-xs leading-6 text-white/60">模型执行失败后只留下了测试占位记录。该记录不能交付甲方、不能下载成品，也不应进入验收结算；请在执行页重试该节点。</p></div> : null}

      <div
        className="delivery-markdown mt-6 min-w-0"
        dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
      />
    </div>

    <details className="mt-4 shrink-0 rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/45"><summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-white/55"><Code2 size={14} />技术证据与原始数据</summary><pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-5">{JSON.stringify(result, null, 2)}</pre><a className="mt-4 inline-flex items-center gap-2 font-semibold text-cyan" href={sourceUri} target="_blank" rel="noreferrer">打开登记的证据 URI<ExternalLink size={13} /></a></details>
  </div>;
}
