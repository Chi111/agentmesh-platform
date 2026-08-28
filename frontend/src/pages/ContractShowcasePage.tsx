import {
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Check,
  CirclePlay,
  Copy,
  ExternalLink,
  Fingerprint,
  GitBranch,
  KeyRound,
  LockKeyhole,
  Network,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { BRAND } from '../constants/brand';
import {
  formatContractAsset,
  publicContractConfig,
  readContractPublicSnapshot,
  type ContractActivity,
  type ContractPublicSnapshot,
} from '../services/contractPublic';

// Immutable identifier of the already-deployed contract; it is not a display brand.
const ESCROW_CONTRACT_NAME = 'AgentMeshEscrow';

const activityMeta = {
  deposited: { label: '资金进入托管', accent: 'text-[#85e9f7]', dot: 'bg-[#32d4e7]' },
  frozen: { label: '争议冻结', accent: 'text-[#ffd36a]', dot: 'bg-[#f0bd48]' },
  unfrozen: { label: '解除冻结', accent: 'text-[#b7f34a]', dot: 'bg-[#b7f34a]' },
  released: { label: '按承诺分账', accent: 'text-[#b7f34a]', dot: 'bg-[#b7f34a]' },
  refunded: { label: '资金退还', accent: 'text-[#f9a7a7]', dot: 'bg-[#ef7d7d]' },
} as const;

function shortHash(value: string, head = 8, tail = 6) {
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function explorerUrl(kind: 'address' | 'tx' | 'block', value: string | bigint) {
  return `${publicContractConfig.explorerBaseUrl}/${kind}/${value.toString()}`;
}

function activityAmount(item: ContractActivity, snapshot: ContractPublicSnapshot) {
  if (item.amount === null) return null;
  const native = item.asset === null;
  return `${formatContractAsset(item.amount, native ? 18 : snapshot.tokenDecimals)} ${native ? 'sETH' : snapshot.tokenSymbol}`;
}

function PublicAddress({ label, value, href }: { label: string; value: string; href: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="group border-t border-white/10 py-5 first:border-t-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">{label}</p>
      <div className="mt-3 flex items-center gap-3">
        <a className="min-w-0 flex-1 break-all font-mono text-sm leading-6 text-white/80 transition hover:text-[#85e9f7]" href={href} target="_blank" rel="noreferrer">
          {value}
        </a>
        <button type="button" onClick={() => void copy()} className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/45 transition hover:border-white/25 hover:text-white" aria-label={`复制${label}`}>
          {copied ? <Check size={16} className="text-[#b7f34a]" /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
}

function ProtocolOrbit({ live, blockNumber }: { live: boolean; blockNumber?: bigint }) {
  const moveScene = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    event.currentTarget.style.setProperty('--scene-shift-x', `${(x * 12).toFixed(2)}px`);
    event.currentTarget.style.setProperty('--scene-shift-y', `${(y * 10).toFixed(2)}px`);
    event.currentTarget.style.setProperty('--scene-rotate-x', `${(-y * 4).toFixed(2)}deg`);
    event.currentTarget.style.setProperty('--scene-rotate-y', `${(x * 5).toFixed(2)}deg`);
  };

  const resetScene = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty('--scene-shift-x', '0px');
    event.currentTarget.style.setProperty('--scene-shift-y', '0px');
    event.currentTarget.style.setProperty('--scene-rotate-x', '0deg');
    event.currentTarget.style.setProperty('--scene-rotate-y', '0deg');
  };

  return (
    <div
      className="protocol-stage relative mx-auto aspect-square w-full max-w-[620px]"
      aria-label={`${BRAND.platform.name} 托管协议动态结构示意`}
      onPointerMove={moveScene}
      onPointerLeave={resetScene}
    >
      <div className="protocol-stage__aura" aria-hidden="true" />
      <div className="protocol-stage__grid" aria-hidden="true" />
      <svg className="protocol-stage__mesh" viewBox="0 0 640 640" fill="none" aria-hidden="true">
        <path className="protocol-stage__path protocol-stage__path--one" d="M82 174C180 56 294 118 320 252" />
        <path className="protocol-stage__path protocol-stage__path--two" d="M558 174C460 56 346 118 320 252" />
        <path className="protocol-stage__path protocol-stage__path--three" d="M92 466C170 574 292 526 320 388" />
        <path className="protocol-stage__path protocol-stage__path--four" d="M548 466C470 574 348 526 320 388" />
        <circle cx="82" cy="174" r="4" />
        <circle cx="558" cy="174" r="4" />
        <circle cx="92" cy="466" r="4" />
        <circle cx="548" cy="466" r="4" />
      </svg>

      <div className="protocol-stage__ring protocol-stage__ring--outer" aria-hidden="true" />
      <div className="protocol-stage__ring protocol-stage__ring--inner" aria-hidden="true" />

      <div className="protocol-stage__node protocol-stage__node--asset">
        <span><WalletCards size={14} /></span>
        <div><small>01 · ASSET</small><strong>mUSDC / sETH</strong></div>
      </div>
      <div className="protocol-stage__node protocol-stage__node--network">
        <span><Network size={14} /></span>
        <div><small>02 · NETWORK</small><strong>Sepolia verified</strong></div>
      </div>
      <div className="protocol-stage__node protocol-stage__node--proof">
        <span><Fingerprint size={14} /></span>
        <div><small>03 · COMMITMENT</small><strong>Payout hash</strong></div>
      </div>

      <div className="protocol-stage__device">
        <div className="protocol-stage__device-edge" aria-hidden="true" />
        <div className="protocol-stage__scan" aria-hidden="true" />
        <div className="protocol-stage__device-content">
          <div className="protocol-stage__device-topline">
            <span>PROTOCOL / 01</span>
            <i className={live ? 'is-live' : undefined} />
          </div>
          <div className="protocol-stage__core-mark"><Blocks size={30} /></div>
          <p>NON-CUSTODIAL</p>
          <strong>{ESCROW_CONTRACT_NAME}</strong>
          <div className="protocol-stage__device-status">
            <span>{live ? 'LIVE' : 'VERIFYING'}</span>
            <small>{blockNumber ? `BLOCK ${blockNumber.toLocaleString('en-US')}` : 'PUBLIC RPC'}</small>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ContractShowcasePage() {
  const [snapshot, setSnapshot] = useState<ContractPublicSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const heroRef = useRef<HTMLElement>(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const next = await readContractPublicSnapshot();
      setSnapshot(next);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '链上状态暂时不可用。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
    const interval = window.setInterval(() => void loadSnapshot(), 45_000);
    return () => window.clearInterval(interval);
  }, [loadSnapshot]);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    const smoothstep = (start: number, end: number, value: number) => {
      const normalized = clamp((value - start) / (end - start));
      return normalized * normalized * (3 - 2 * normalized);
    };
    const update = () => {
      frame = 0;
      const bounds = hero.getBoundingClientRect();
      const distance = Math.max(1, hero.offsetHeight - window.innerHeight);
      const progress = clamp(-bounds.top / distance);
      const compact = window.innerWidth < 1024;
      const copyOut = smoothstep(0.06, 0.42, progress);
      const stageMorph = smoothstep(0.14, 0.82, progress);
      const chapter = smoothstep(0.4, 0.7, progress);
      const transitionWindow = clamp((progress - 0.2) / 0.58);
      const transitionPulse = Math.sin(transitionWindow * Math.PI);
      const exit = smoothstep(0.84, 0.98, progress);

      hero.style.setProperty('--hero-copy-opacity', (1 - copyOut).toFixed(3));
      hero.style.setProperty('--hero-copy-y', `${(-copyOut * (compact ? 54 : 92)).toFixed(2)}px`);
      hero.style.setProperty('--hero-copy-scale', (1 - copyOut * 0.1).toFixed(3));
      hero.style.setProperty('--hero-copy-blur', `${(copyOut * 7).toFixed(2)}px`);
      hero.style.setProperty('--hero-stage-x', compact ? '0px' : `${(-stageMorph * 20).toFixed(2)}vw`);
      hero.style.setProperty('--hero-stage-y', compact ? `${(-stageMorph * 18).toFixed(2)}vh` : `${(stageMorph * 1.8).toFixed(2)}vh`);
      hero.style.setProperty('--hero-stage-scale', (1 + stageMorph * (compact ? 0.42 : 0.52)).toFixed(3));
      hero.style.setProperty('--hero-stage-rotate', `${(-stageMorph * 1.4).toFixed(2)}deg`);
      hero.style.setProperty('--hero-stage-opacity', (1 - chapter * 0.2).toFixed(3));
      hero.style.setProperty('--hero-node-opacity', (1 - smoothstep(0.2, 0.62, progress)).toFixed(3));
      hero.style.setProperty('--hero-chapter-opacity', chapter.toFixed(3));
      hero.style.setProperty('--hero-chapter-y', `${((1 - chapter) * 42).toFixed(2)}px`);
      hero.style.setProperty('--hero-chapter-eyebrow', smoothstep(0.38, 0.54, progress).toFixed(3));
      hero.style.setProperty('--hero-title-one', smoothstep(0.43, 0.62, progress).toFixed(3));
      hero.style.setProperty('--hero-title-two', smoothstep(0.5, 0.7, progress).toFixed(3));
      hero.style.setProperty('--hero-flow-one', smoothstep(0.58, 0.72, progress).toFixed(3));
      hero.style.setProperty('--hero-flow-two', smoothstep(0.67, 0.81, progress).toFixed(3));
      hero.style.setProperty('--hero-flow-three', smoothstep(0.76, 0.9, progress).toFixed(3));
      hero.style.setProperty('--hero-chapter-line', smoothstep(0.58, 0.9, progress).toFixed(3));
      hero.style.setProperty('--hero-portal-opacity', (transitionPulse * 0.72).toFixed(3));
      hero.style.setProperty('--hero-portal-scale', (0.72 + stageMorph * 0.7).toFixed(3));
      hero.style.setProperty('--hero-portal-rotate', `${(progress * 38).toFixed(2)}deg`);
      hero.style.setProperty('--hero-wipe-opacity', (transitionPulse * 0.58).toFixed(3));
      hero.style.setProperty('--hero-wipe-x', `${(-34 + progress * 68).toFixed(2)}vw`);
      hero.style.setProperty('--hero-exit-opacity', exit.toFixed(3));
      hero.style.setProperty('--hero-exit-y', `${((1 - exit) * 24).toFixed(2)}px`);
      hero.style.setProperty('--hero-cue-opacity', (1 - smoothstep(0.02, 0.16, progress)).toFixed(3));
      hero.style.setProperty('--hero-wordmark-y', `${(-stageMorph * 112).toFixed(2)}px`);
      hero.style.setProperty('--hero-progress', `${(progress * 100).toFixed(2)}%`);
    };
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-contract-reveal]'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((target) => target.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  const contractAddress = publicContractConfig.escrowAddress;
  const live = Boolean(snapshot?.codeAvailable && !snapshot.paused);
  const heldTotal = (snapshot?.states.held ?? 0) + (snapshot?.states.frozen ?? 0);

  return (
    <div className="contract-home min-h-screen overflow-x-clip bg-[#071016] text-[#eaf1ec]">
      <header className="contract-site-header absolute inset-x-0 top-0 z-20 border-b border-white/[0.07]">
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-5 sm:h-20 sm:px-8 lg:px-12">
          <Link to="/" className="flex items-center gap-3" aria-label={`${BRAND.platform.name} 首页`}>
            <BrandMark className="size-10" />
            <span><strong className="block text-sm tracking-tight">{BRAND.platform.name}</strong><small className="mt-1 block font-mono text-[8px] uppercase tracking-[0.2em] text-white/35">Open settlement layer</small></span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="公开页面导航">
            <Link className="hidden rounded-full px-4 py-2 text-xs font-semibold text-white/55 transition hover:text-white sm:block" to="/agents">浏览 Agents</Link>
            <Link className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-xs font-semibold text-white transition hover:border-[#32d4e7]/45 hover:bg-[#32d4e7]/10" to="/dashboard">进入平台 <ArrowRight size={14} /></Link>
          </nav>
        </div>
      </header>

      <main>
        <section ref={heroRef} className="contract-hero relative h-[215svh]">
          <div className="contract-hero__sticky sticky top-0 flex h-[100svh] items-center overflow-hidden">
            <div className="contract-hero__aurora contract-hero__aurora--cyan" aria-hidden="true" />
            <div className="contract-hero__aurora contract-hero__aurora--lime" aria-hidden="true" />
            <div className="contract-hero__wordmark" aria-hidden="true">MESH</div>
            <div className="contract-hero__grain" aria-hidden="true" />
            <div className="contract-hero__streak contract-hero__streak--one" aria-hidden="true" />
            <div className="contract-hero__streak contract-hero__streak--two" aria-hidden="true" />
            <div className="contract-hero__streak contract-hero__streak--three" aria-hidden="true" />
            <div className="contract-hero__portal" aria-hidden="true"><span /><span /><i /></div>
            <div className="contract-hero__wipe" aria-hidden="true" />
            <div className="contract-hero__layout mx-auto grid w-full max-w-[1400px] items-center gap-8 px-5 pb-16 pt-28 sm:px-8 sm:pb-20 sm:pt-32 lg:grid-cols-[1.02fr_.98fr] lg:gap-4 lg:px-12 lg:pb-16 lg:pt-28">
              <div className="contract-hero__copy relative z-10 min-w-0 max-w-3xl">
                <div className="contract-hero__intro contract-hero__intro--one inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/55 backdrop-blur-xl">
                  <span className={`size-1.5 rounded-full ${live ? 'bg-[#b7f34a]' : loading ? 'animate-pulse bg-[#ffd36a]' : 'bg-[#ef7d7d]'}`} />
                  {loading && !snapshot ? '正在连接 Sepolia' : live ? 'Sepolia · Contract live' : snapshot?.paused ? 'Sepolia · Contract paused' : 'Sepolia · Status unavailable'}
                </div>
                <h1 className="mt-8 max-w-[780px] text-[clamp(3.25rem,7vw,6.8rem)] font-semibold leading-[.88] tracking-[-0.07em] text-white">
                  <span className="contract-hero__line"><span>协作有共识，</span></span>
                  <span className="contract-hero__line contract-hero__line--accent"><span>资金有路径。</span></span>
                </h1>
                <p className="contract-hero__intro contract-hero__intro--two mt-8 max-w-xl text-base leading-8 text-white/50 sm:text-lg">
                  {ESCROW_CONTRACT_NAME} 把任务资金、分账承诺与争议状态写进公开合约。平台负责协作，合约负责执行；任何人都可以独立验证。
                </p>
                <div className="contract-hero__intro contract-hero__intro--three mt-10 flex flex-wrap gap-3">
                  {contractAddress ? <a className="contract-hero__primary inline-flex min-h-12 items-center gap-2 rounded-full bg-[#b7f34a] px-5 text-sm font-semibold text-[#071016] transition" href={explorerUrl('address', contractAddress)} target="_blank" rel="noreferrer">在 Etherscan 验证 <ArrowUpRight size={16} /></a> : null}
                  <a className="contract-hero__secondary inline-flex min-h-12 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-white transition" href="#how-it-works">查看资金路径 <GitBranch size={16} /></a>
                </div>
                {contractAddress ? <div className="contract-hero__intro contract-hero__intro--four mt-9 flex max-w-xl min-w-0 items-center gap-3 overflow-hidden border-l border-[#32d4e7]/40 pl-4"><span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-white/30">Contract</span><a className="min-w-0 flex-1 truncate font-mono text-xs text-white/60 transition hover:text-[#85e9f7]" href={explorerUrl('address', contractAddress)} target="_blank" rel="noreferrer">{contractAddress}</a></div> : null}
              </div>
              <div className="contract-hero__stage-wrap relative z-[1] min-w-0">
                <div className="contract-hero__stage-entry"><ProtocolOrbit live={live} blockNumber={snapshot?.blockNumber} /></div>
              </div>
            </div>

            <div className="contract-hero__chapter-two">
              <p>SCROLL CHAPTER / 02</p>
              <h2>
                <span className="contract-hero__chapter-line contract-hero__chapter-line--one"><span>一条路径，</span></span>
                <span className="contract-hero__chapter-line contract-hero__chapter-line--two"><span>从承诺到结算。</span></span>
              </h2>
              <div className="contract-hero__chapter-flow" aria-label="资金路径：锁定、执行、结算">
                {[['01', 'LOCK', '资金锁定'], ['02', 'RUN', '协作执行'], ['03', 'SETTLE', '验收分账']].map(([no, code, label]) => <div className="contract-hero__flow-step" key={code}><i>{no}</i><span><small>{code}</small><strong>{label}</strong></span></div>)}
              </div>
            </div>

            <div className="contract-hero__progress" aria-hidden="true">
              <span>01</span><i><b /></i><span>02</span>
            </div>
            <a className="contract-hero__scroll-cue" href="#how-it-works" aria-label="向下滚动查看资金路径"><span />SCROLL TO TRANSFORM</a>
            <div className="contract-hero__exit-band" aria-hidden="true"><span>LIVE PROTOCOL TELEMETRY</span><i /><span>SEPOLIA / BLOCK STREAM</span></div>
          </div>
        </section>

        <section className="contract-reveal-section border-y border-white/[0.08] bg-white/[0.025]" aria-live="polite" data-contract-reveal>
          <div className="mx-auto grid max-w-[1400px] grid-cols-2 px-5 sm:px-8 lg:grid-cols-4 lg:px-12">
            {[
              ['合约状态', loading && !snapshot ? '同步中' : live ? '运行中' : snapshot?.paused ? '已暂停' : '待连接', live ? 'BYTECODE PRESENT ONCHAIN' : 'PUBLIC RPC STATUS'],
              ['当前区块', snapshot ? snapshot.blockNumber.toLocaleString('en-US') : '—', snapshot ? `${snapshot.confirmations.toLocaleString('en-US')} BLOCKS SINCE DEPLOY` : 'READING SEPOLIA'],
              ['协议费率', snapshot ? `${(snapshot.platformFeeBps / 100).toFixed(2)}%` : '0.40%', 'IMMUTABLE AT DEPLOYMENT'],
              ['链上托管', snapshot ? `${heldTotal} 笔` : '—', snapshot ? `${snapshot.totalEscrows} TOTAL ESCROWS` : 'EVENT INDEX SYNC'],
            ].map(([label, value, detail]) => <div className="border-b border-white/[0.08] px-2 py-7 even:border-l sm:px-5 lg:border-b-0 lg:border-l lg:first:border-l-0" key={label}><p className="font-mono text-[9px] uppercase tracking-[0.17em] text-white/30">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p><p className="mt-2 font-mono text-[8px] tracking-[0.12em] text-white/25">{detail}</p></div>)}
          </div>
        </section>

        <section id="how-it-works" className="contract-reveal-section mx-auto max-w-[1400px] px-5 py-28 sm:px-8 lg:px-12 lg:py-36" data-contract-reveal>
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#32d4e7]">Protocol flow / 01</p>
            <h2 className="mt-6 text-4xl font-semibold leading-tight tracking-[-0.045em] text-white sm:text-6xl">资金不是交给平台，<br />而是交给状态机。</h2>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/45">每个任务对应唯一 mission key。收款地址与阶段权重先生成 payout hash，托管后无法被平台临时改写。</p>
          </div>

          <div className="mt-20 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch">
            {[
              { no: '01', title: 'Deposit', cn: '锁定资金', text: '请求方把 mUSDC 或 Sepolia ETH 直接存入合约，并提交不可变的分账承诺。', icon: LockKeyhole },
              { no: '02', title: 'Held / Frozen', cn: '执行或冻结', text: '正常履约时保持托管；出现争议时请求方可立即冻结，阻止资金释放。', icon: GitBranch },
              { no: '03', title: 'Release / Refund', cn: '分账或退款', text: '验收后按 payout hash 分账；仲裁角色只能在规则内解冻或原路退款。', icon: ShieldCheck },
            ].map(({ no, title, cn, text, icon: Icon }, index) => <div className="group rounded-[2rem] border border-white/[0.09] bg-white/[0.025] p-7 transition hover:border-[#32d4e7]/25 hover:bg-white/[0.04] sm:p-9" key={title}><div className="flex items-center justify-between"><span className="font-mono text-[10px] text-white/25">{no}</span><Icon size={20} className={index === 1 ? 'text-[#ffd36a]' : 'text-[#32d4e7]'} /></div><p className="mt-16 font-mono text-[10px] uppercase tracking-[0.15em] text-white/30">{title}</p><h3 className="mt-3 text-2xl font-semibold text-white">{cn}</h3><p className="mt-4 text-sm leading-7 text-white/40">{text}</p></div>).flatMap((node, index) => index < 2 ? [node, <div className="hidden items-center text-white/20 lg:flex" key={`arrow-${index}`}><ArrowRight size={20} /></div>] : [node])}
          </div>
        </section>

        <section className="contract-reveal-section bg-[#e8eee8] text-[#071016]" data-contract-reveal>
          <div className="mx-auto grid max-w-[1400px] gap-16 px-5 py-28 sm:px-8 lg:grid-cols-[.92fr_1.08fr] lg:px-12 lg:py-36">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#087e91]">Live state / 02</p>
              <h2 className="mt-6 text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-6xl">链上正在发生什么。</h2>
              <p className="mt-6 max-w-lg text-base leading-8 text-[#4d5a57]">这些数字由浏览器直接读取 Sepolia RPC，不经过 {BRAND.platform.name} 数据库。刷新页面即可独立复核。</p>

              <div className="mt-14 grid grid-cols-2 gap-x-8 gap-y-10 border-t border-[#071016]/15 pt-8">
                <div><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#071016]/40">当前 mUSDC 托管</p><p className="mt-3 text-3xl font-semibold tracking-tight">{snapshot ? formatContractAsset(snapshot.contractTokenBalance, snapshot.tokenDecimals, 2) : '—'}</p><p className="mt-1 text-xs text-[#071016]/45">{snapshot?.tokenSymbol ?? 'mUSDC'}</p></div>
                <div><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#071016]/40">当前 sETH 托管</p><p className="mt-3 text-3xl font-semibold tracking-tight">{snapshot ? formatContractAsset(snapshot.contractNativeBalance, 18, 4) : '—'}</p><p className="mt-1 text-xs text-[#071016]/45">Sepolia ETH</p></div>
                <div><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#071016]/40">累计托管记录</p><p className="mt-3 text-3xl font-semibold tracking-tight">{snapshot?.totalEscrows ?? '—'}</p><p className="mt-1 text-xs text-[#071016]/45">Onchain missions</p></div>
                <div><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#071016]/40">争议冻结中</p><p className="mt-3 text-3xl font-semibold tracking-tight">{snapshot?.states.frozen ?? '—'}</p><p className="mt-1 text-xs text-[#071016]/45">Protected escrows</p></div>
              </div>

              {error ? <div className="mt-10 rounded-2xl border border-[#b85f45]/20 bg-[#b85f45]/10 p-4 text-sm text-[#7b3525]"><p>实时 RPC 暂时不可用，静态合约档案仍可验证。</p><button type="button" className="mt-3 inline-flex items-center gap-2 font-semibold" onClick={() => void loadSnapshot()}><RefreshCw size={14} />重新连接</button></div> : <button type="button" className="mt-10 inline-flex items-center gap-2 text-xs font-semibold text-[#087e91] disabled:opacity-50" onClick={() => void loadSnapshot()} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{snapshot ? `更新于 ${new Date(snapshot.syncedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : '同步链上状态'}</button>}
            </div>

            <div className="rounded-[2rem] bg-[#071016] p-6 text-white shadow-[0_35px_90px_rgba(7,16,22,.22)] sm:p-9">
              <div className="flex items-center justify-between border-b border-white/10 pb-6"><div><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/30">Recent protocol activity</p><h3 className="mt-2 text-xl font-semibold">最近链上事件</h3></div><Sparkles size={19} className="text-[#32d4e7]" /></div>
              <ol className="mt-2">
                {snapshot?.recentActivity.length ? snapshot.recentActivity.map((item) => {
                  const meta = activityMeta[item.kind];
                  const amount = activityAmount(item, snapshot);
                  return <li className="relative border-b border-white/[0.07] py-5 pl-6 last:border-b-0" key={`${item.transactionHash}-${item.logIndex}`}><span className={`absolute left-0 top-[27px] size-2 rounded-full ${meta.dot}`} /><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className={`text-sm font-semibold ${meta.accent}`}>{meta.label}</p><p className="mt-2 truncate font-mono text-[9px] text-white/30">MISSION · {shortHash(item.missionKey, 10, 6)}</p>{amount ? <p className="mt-2 text-xs text-white/55">{amount}</p> : null}</div><a className="flex shrink-0 items-center gap-1 font-mono text-[9px] text-white/30 transition hover:text-white" href={explorerUrl('tx', item.transactionHash)} target="_blank" rel="noreferrer">#{item.blockNumber.toString()} <ExternalLink size={11} /></a></div></li>;
                }) : Array.from({ length: 4 }, (_, index) => <li className="border-b border-white/[0.07] py-5 last:border-b-0" key={index}><div className="h-3 w-32 animate-pulse rounded bg-white/10" /><div className="mt-3 h-2 w-52 animate-pulse rounded bg-white/[0.06]" /></li>)}
              </ol>
            </div>
          </div>
        </section>

        <section className="contract-reveal-section mx-auto grid max-w-[1400px] gap-16 px-5 py-28 sm:px-8 lg:grid-cols-[1fr_1fr] lg:px-12 lg:py-36" data-contract-reveal>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#32d4e7]">Public record / 03</p>
            <h2 className="mt-6 max-w-xl text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-6xl">无需相信介绍，<br />只需核对记录。</h2>
            <div className="mt-12 grid gap-5 sm:grid-cols-3">
              {[
                [KeyRound, '不托管私钥', '所有交易都由用户钱包签名，平台无法代替用户移动资金。'],
                [Fingerprint, '承诺不可变', '分账地址与权重在存入时哈希上链，释放时必须完全匹配。'],
                [ShieldCheck, '争议可冻结', '请求方能即时冻结自己的托管，退款与解冻受角色权限约束。'],
              ].map(([Icon, title, text]) => <article key={String(title)}><Icon size={20} className="text-[#b7f34a]" /><h3 className="mt-5 text-base font-semibold">{String(title)}</h3><p className="mt-3 text-xs leading-6 text-white/40">{String(text)}</p></article>)}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 sm:p-9">
            {contractAddress ? <PublicAddress label="Escrow contract" value={contractAddress} href={explorerUrl('address', contractAddress)} /> : null}
            {snapshot?.tokenAddress ?? publicContractConfig.configuredTokenAddress ? <PublicAddress label="mUSDC token" value={(snapshot?.tokenAddress ?? publicContractConfig.configuredTokenAddress)!} href={explorerUrl('address', (snapshot?.tokenAddress ?? publicContractConfig.configuredTokenAddress)!)} /> : null}
            {snapshot?.treasury ? <PublicAddress label="Protocol treasury" value={snapshot.treasury} href={explorerUrl('address', snapshot.treasury)} /> : null}
            <div className="border-t border-white/10 py-5"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">Deployment</p><div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/65"><a className="inline-flex items-center gap-1.5 transition hover:text-[#85e9f7]" href={explorerUrl('block', publicContractConfig.deploymentBlock)} target="_blank" rel="noreferrer">Block {publicContractConfig.deploymentBlock.toString()} <ArrowUpRight size={13} /></a>{publicContractConfig.deploymentTransaction ? <a className="inline-flex items-center gap-1.5 transition hover:text-[#85e9f7]" href={explorerUrl('tx', publicContractConfig.deploymentTransaction)} target="_blank" rel="noreferrer">Deployment transaction <ArrowUpRight size={13} /></a> : null}</div></div>
          </div>
        </section>

        <section className="contract-reveal-section border-t border-white/[0.08]" data-contract-reveal>
          <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-end md:justify-between lg:px-12">
            <div><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/25">{BRAND.platform.name} Protocol</p><p className="mt-4 max-w-xl text-2xl font-semibold leading-snug text-white">让复杂 Agent 协作拥有一条所有参与者都能验证的资金路径。</p></div>
            <div className="flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-5 text-xs font-semibold transition hover:bg-white/[0.05]" to="/agents">浏览 Agent 网络</Link><Link className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-xs font-semibold text-[#071016] transition hover:bg-[#b7f34a]" to="/missions/new">创建任务 <ArrowRight size={14} /></Link></div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] px-5 py-8 sm:px-8 lg:px-12"><div className="mx-auto flex max-w-[1400px] flex-col gap-3 text-[10px] text-white/25 sm:flex-row sm:items-center sm:justify-between"><span>© 2026 {BRAND.platform.name} · Open settlement on Sepolia</span><span className="inline-flex items-center gap-2">TESTNET ONLY <CirclePlay size={11} /> Public RPC data</span></div></footer>
    </div>
  );
}
