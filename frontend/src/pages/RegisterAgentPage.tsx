import { ArrowLeft, ArrowRight, Check, Code2, Link2, LoaderCircle, Rocket, ShieldCheck, Sparkles, WalletCards } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppStore } from '../store/useAppStore';

const categories = ['内容生成', '图像生成', '视频生成', '数据研究', '商业分析', '语言服务', '软件开发'];

function readNumber(input: HTMLInputElement, fallback: number) {
  return Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : fallback;
}

export function RegisterAgentPage() {
  const navigate = useNavigate();
  const registerAgent = useAppStore((state) => state.registerAgent);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [authType, setAuthType] = useState<'none' | 'api_key' | 'bearer' | 'jwt'>('none');
  const [price, setPrice] = useState(40);
  const [wallet, setWallet] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 3 || summary.trim().length < 30 || !endpoint.startsWith('https://') || !wallet.trim()) {
      setError('请补全 Agent 名称、至少 30 字的描述、HTTPS 端点和收款钱包。');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const id = await registerAgent({ name: name.trim(), category, summary: summary.trim(), tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), endpoint, authType, price, wallet });
      navigate(`/agents/${id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Agent 注册失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-3"><Link to="/developer/agents" className="rounded-lg p-2 text-muted hover:bg-white hover:text-ink" aria-label="返回我的 Agent"><ArrowLeft size={18} /></Link><PageHeader eyebrow="Connect → Trial → Publish" title="注册 Agent" description="把已部署的 Agent 接入调度网络。平台负责调用、证据、分发与结算，Agent 仍运行在开发者自己的基础设施上。" /></div>

      <form className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]" onSubmit={submit}>
        <aside className="panel self-start p-4 xl:sticky xl:top-24">
          <p className="eyebrow px-2">Onboarding</p>
          <ol className="mt-4 space-y-1">
            {[
              ['01','基本信息','名称、能力与品牌',Check],
              ['02','连接设置','API、鉴权与 Schema',Link2],
              ['03','定价与钱包','计费与收款地址',WalletCards],
              ['04','AI 试炼','平台质量校验',Sparkles],
            ].map(([index,title,detail,Icon], itemIndex) => <li className={`flex gap-3 rounded-xl p-3 ${itemIndex === 1 ? 'border border-cyan/25 bg-cyan/[0.06]' : ''}`} key={String(title)}><span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${itemIndex < 2 ? 'bg-cyan text-ink' : 'bg-canvas text-muted'}`}>{itemIndex === 0 ? <Check size={14} /> : <Icon size={14} />}</span><div><p className="text-sm font-semibold">{String(title)}</p><p className="mt-1 text-[10px] leading-4 text-muted">{String(detail)}</p><span className="sr-only">步骤 {String(index)}</span></div></li>)}
          </ol>
          <div className="mt-5 rounded-xl bg-ink p-4 text-white"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-cyan">Security boundary</p><p className="mt-2 text-xs leading-5 text-white/45">Agent 凭证不会经过浏览器或 D1；需要鉴权的端点由 Worker Secret 层配置。</p></div>
        </aside>

        <div className="space-y-5">
          <section className="panel p-5 md:p-6"><div className="flex items-center gap-3 border-b border-line pb-4"><span className="flex size-10 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Rocket size={18} /></span><div><h2 className="font-semibold">基本信息</h2><p className="mt-1 text-xs text-muted">用于检索、匹配与公开能力档案。</p></div></div><div className="mt-5 grid gap-5 md:grid-cols-2"><label><span className="field-label">Agent 名称</span><input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 ResearchPilot" /></label><label><span className="field-label">分类</span><select className="field" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="md:col-span-2"><span className="field-label">能力描述</span><textarea className="field min-h-28" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="说明擅长场景、输入要求、输出质量和限制…" /></label><label className="md:col-span-2"><span className="field-label">能力标签</span><input className="field" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="用英文逗号分隔，例如 research, fact-check, report" /></label></div></section>

          <section className="panel p-5 md:p-6"><div className="flex items-center gap-3 border-b border-line pb-4"><span className="flex size-10 items-center justify-center rounded-xl bg-lime/20"><Code2 size={18} /></span><div><h2 className="font-semibold">连接设置</h2><p className="mt-1 text-xs text-muted">定义调度引擎如何安全调用你的 API。</p></div></div><div className="mt-5 space-y-5"><label><span className="field-label">API Endpoint URL</span><div className="relative"><Link2 size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input className="field pl-10" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.yourdomain.com/v1/agent/execute" /></div><span className="mt-2 block text-xs text-muted">必须是公网可访问的 HTTPS 地址。</span></label><label><span className="field-label">鉴权类型</span><select className="field" value={authType} onChange={(event) => setAuthType(event.target.value as typeof authType)}><option value="none">无鉴权（可立即调度）</option><option value="bearer">Bearer Token（需配置 Worker Secret）</option><option value="api_key">API Key Header（需配置 Worker Secret）</option><option value="jwt">JWT（需配置 Worker Secret）</option></select></label><div className="rounded-xl border border-warning/25 bg-warning/[0.07] p-3 text-xs leading-5 text-muted"><ShieldCheck size={14} className="mr-1.5 inline text-warning" />这里不接收 Secret。选择需要鉴权的类型后，由平台运维在 Worker Secret 层单独绑定凭据。</div><div className="grid gap-4 md:grid-cols-2"><article className="rounded-xl border border-line bg-canvas/45 p-4"><div className="flex items-center justify-between"><p className="font-mono text-[10px] font-semibold">REQUEST SCHEMA</p><Code2 size={14} /></div><pre className="mt-3 overflow-x-auto font-mono text-[9px] leading-5 text-muted">{'{ "task": "string",\n  "context": "object",\n  "request_id": "uuid" }'}</pre></article><article className="rounded-xl border border-line bg-canvas/45 p-4"><div className="flex items-center justify-between"><p className="font-mono text-[10px] font-semibold">RESPONSE SCHEMA</p><Code2 size={14} /></div><pre className="mt-3 overflow-x-auto font-mono text-[9px] leading-5 text-muted">{'{ "status": "success",\n  "result": "object",\n  "evidence_hash": "string" }'}</pre></article></div></div></section>

          <section className="panel p-5 md:p-6"><div className="flex items-center gap-3 border-b border-line pb-4"><span className="flex size-10 items-center justify-center rounded-xl bg-canvas"><WalletCards size={18} /></span><div><h2 className="font-semibold">定价与收款</h2><p className="mt-1 text-xs text-muted">平台按已验收调用结算，收取 0.4% 协议费。</p></div></div><div className="mt-5 grid gap-5 md:grid-cols-2"><label><span className="field-label">单次调用基础价（USDC）</span><input className="field" type="number" min="1" value={price} onChange={(event) => setPrice(readNumber(event.currentTarget, 1))} /></label><label><span className="field-label">收款钱包地址</span><input className="field" value={wallet} onChange={(event) => setWallet(event.target.value)} placeholder="0x…" /></label></div><div className="mt-5 rounded-xl border border-cyan/20 bg-cyan/[0.06] p-4"><div className="flex gap-3"><ShieldCheck size={18} className="shrink-0 text-cyan" /><div><p className="text-sm font-semibold">AI 试炼将在提交后运行</p><p className="mt-1 text-xs leading-5 text-muted">平台使用历史任务至少调用 3 次，评估正确性、稳定性、时延和 Schema 合规性。通过后才可接单。</p></div></div></div></section>

          {error ? <p className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end"><span className="mr-auto text-xs text-muted">提交后写入 D1，可继续运行真实试炼。</span><Link className="btn-secondary" to="/developer/agents">取消</Link><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? <LoaderCircle size={16} className="animate-spin" /> : null}{submitting ? '正在注册…' : '提交 Agent'} <ArrowRight size={16} /></button></div>
        </div>
      </form>
    </div>
  );
}
