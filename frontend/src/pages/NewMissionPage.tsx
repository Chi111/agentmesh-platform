import { ArrowRight, BrainCircuit, CalendarDays, CircleDollarSign, FileText, LoaderCircle, Sparkles, Tags } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppStore } from '../store/useAppStore';
import type { ExpertiseLevel, Mission, PaymentMethod } from '../types/domain';
import { formatPaymentAmount, paymentInput, paymentOptions, paymentToken } from '../utils/payments';

const categories = ['视频生产', '内容生成', '数据研究', '商业分析', '语言服务', '软件开发'];
const suggestedTags = ['品牌叙事', '短视频', '市场分析', '图像生成', '数据核验', '本地化'];

function readNumber(input: HTMLInputElement, fallback: number) {
  return Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : fallback;
}

export function NewMissionPage() {
  const navigate = useNavigate();
  const { onchainSettlement } = useAuth();
  const createMission = useAppStore((state) => state.createMission);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [tags, setTags] = useState<string[]>(['品牌叙事']);
  const [budget, setBudget] = useState(80);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('web2_balance');
  const [deadline, setDeadline] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().slice(0, 10);
  });
  const [priority, setPriority] = useState<Mission['priority']>('normal');
  const [expertise, setExpertise] = useState<ExpertiseLevel>('expert');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (tag: string) => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 8 || description.trim().length < 30) {
      setError('请提供至少 8 个字的目标标题和 30 个字的任务描述。');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const id = await createMission({ title: title.trim(), description: description.trim(), category, tags, budget, paymentMethod, deadline, priority, expertise, yieldEnabled: false });
      navigate(`/missions/${id}/workflow`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '任务创建失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Intent → Specification" title="描述目标，AI 负责组织执行" description="你只需要定义结果、约束和预算。平台会把自然语言目标编译成可匹配、可验收、可结算的任务规格。" />

      <form className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]" onSubmit={submit}>
        <div className="space-y-5">
          <section className="panel p-5 md:p-6">
            <div className="flex items-center gap-3 border-b border-line pb-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><FileText size={19} /></span>
              <div><h2 className="font-semibold">任务目标</h2><p className="mt-1 text-xs text-muted">定义要完成什么，而不是指定某个 Agent。</p></div>
            </div>
            <div className="mt-5 space-y-5">
              <label>
                <span className="field-label">目标标题</span>
                <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：生成一条 60 秒的产品宣传短片" />
              </label>
              <label>
                <span className="field-label">结果描述</span>
                <textarea className="field min-h-36 resize-y" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明业务背景、受众、交付物、质量标准和必须遵守的限制…" />
                <span className="mt-2 block text-right font-mono text-[10px] text-muted">{description.length} / 2,000</span>
              </label>
            </div>
          </section>

          <section className="panel p-5 md:p-6">
            <div className="flex items-center gap-3 border-b border-line pb-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-lime/20"><Tags size={19} /></span>
              <div><h2 className="font-semibold">分类与语义标签</h2><p className="mt-1 text-xs text-muted">用于 V0 硬匹配和 V1 语义召回。</p></div>
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label><span className="field-label">任务分类</span><select className="field" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span className="field-label">专家级别</span><select className="field" value={expertise} onChange={(event) => setExpertise(event.target.value as ExpertiseLevel)}><option value="standard">标准级</option><option value="expert">专家级</option><option value="principal">资深专家</option></select></label>
            </div>
            <div className="mt-5">
              <span className="field-label">能力标签</span>
              <div className="flex flex-wrap gap-2">
                {suggestedTags.map((tag) => <button type="button" key={tag} onClick={() => toggleTag(tag)} className={`rounded-lg border px-3 py-2 font-mono text-[10px] transition ${tags.includes(tag) ? 'border-cyan/35 bg-cyan/10 text-ink' : 'border-line bg-white text-muted hover:text-ink'}`}>#{tag}</button>)}
              </div>
            </div>
          </section>

          <section className="panel p-5 md:p-6">
            <div className="flex items-center gap-3 border-b border-line pb-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-canvas"><CircleDollarSign size={19} /></span>
              <div><h2 className="font-semibold">预算与支付</h2><p className="mt-1 text-xs text-muted">Web2 只使用 Token（CREDIT）余额；Web3 只使用 Sepolia mUSDC 或 sETH。</p></div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {paymentOptions.map((option) => <button
                type="button"
                key={option.method}
                onClick={() => {
                  setPaymentMethod(option.method);
                  setBudget(paymentInput(option.method).suggested);
                }}
                className={`rounded-xl border p-4 text-left transition ${paymentMethod === option.method ? 'border-cyan bg-cyan/[0.07]' : 'border-line bg-white hover:border-cyan/35'}`}
              >
                <span className="block text-sm font-semibold">{option.title}</span>
                <span className="mt-1 block font-mono text-[10px] text-cyan">{option.token}</span>
                <span className="mt-2 block text-xs leading-5 text-muted">{option.detail}</span>
              </button>)}
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-3">
              <label><span className="field-label">预算（{paymentToken(paymentMethod)}）</span><input className="field" type="number" min={paymentInput(paymentMethod).min} step={paymentInput(paymentMethod).step} value={budget} onChange={(event) => setBudget(readNumber(event.currentTarget, paymentInput(paymentMethod).min))} /></label>
              <label><span className="field-label">截止日期</span><input className="field" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
              <label><span className="field-label">优先级</span><select className="field" value={priority} onChange={(event) => setPriority(event.target.value as Mission['priority'])}><option value="normal">普通</option><option value="high">高</option><option value="urgent">紧急</option></select></label>
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="mesh-grid overflow-hidden rounded-2xl border border-white/10 bg-ink p-5 text-white shadow-card">
            <div className="flex items-center gap-2 text-cyan"><BrainCircuit size={19} /><span className="font-mono text-[10px] uppercase tracking-[0.16em]">Intent Compiler</span></div>
            <h2 className="mt-4 text-lg font-semibold">提交后将自动完成</h2>
            <ol className="mt-5 space-y-4">
              {['识别任务类型与风险', '拆解为可执行阶段', '召回并洗牌候选 Agent', '生成预算与验收标准'].map((item, index) => <li className="flex gap-3 text-sm text-white/65" key={item}><span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-cyan/30 bg-cyan/10 font-mono text-[9px] text-cyan">0{index + 1}</span>{item}</li>)}
            </ol>
            <div className="mt-6 border-t border-white/10 pt-4">
              <div className="flex justify-between text-xs text-white/45"><span>预计预算</span><span className="font-mono text-white">{formatPaymentAmount(budget, paymentMethod)}</span></div>
              <div className="mt-2 flex justify-between text-xs text-white/45"><span>平台费（0.4%）</span><span className="font-mono text-white">{formatPaymentAmount(budget * 0.004, paymentMethod)}</span></div>
            </div>
          </section>
          {error ? <p className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
          <button type="submit" className="btn-signal w-full py-3" disabled={submitting}>{submitting ? <LoaderCircle size={17} className="animate-spin" /> : <Sparkles size={17} />}{submitting ? '正在编译任务…' : 'AI 分析并生成方案'} <ArrowRight size={16} /></button>
          <p className="text-center text-[11px] leading-5 text-muted"><CalendarDays size={13} className="mr-1 inline" />{paymentMethod === 'web2_balance' ? '确认团队后从 Web2 体验余额中锁定预算。' : onchainSettlement ? '确认团队后由钱包提交 Sepolia 链上托管。' : '链上支付已选择，但需先完成 Sepolia 合约配置。'}</p>
        </aside>
      </form>
    </div>
  );
}
