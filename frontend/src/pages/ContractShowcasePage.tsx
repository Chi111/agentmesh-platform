import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CirclePlay,
  Copy,
  ExternalLink,
  Fingerprint,
  GitBranch,
  KeyRound,
  Languages,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { PretextSignalField } from '../components/landing/PretextSignalField';
import { TaskFlowDemo } from '../components/landing/TaskFlowDemo';
import { useLandingInteractions } from '../components/landing/useLandingInteractions';
import '../components/landing/landingEffects.css';
import { BRAND } from '../constants/brand';
import {
  PUBLIC_LOCALE_STORAGE_KEY,
  contractShowcaseCopy,
  detectPublicLocale,
  isPublicLocale,
  publicLocaleOptions,
  type PublicLocale,
} from '../locales/contractShowcase';
import {
  formatContractAsset,
  publicContractConfig,
  readContractPublicSnapshot,
  type ContractActivity,
  type ContractPublicSnapshot,
} from '../services/contractPublic';

const BabylonHeroScene = lazy(() => import('../components/landing/BabylonHeroScene')
  .then((module) => ({ default: module.BabylonHeroScene })));

const activityMeta = {
  deposited: { accent: 'text-[#85e9f7]', dot: 'bg-[#32d4e7]' },
  frozen: { accent: 'text-[#ffd36a]', dot: 'bg-[#f0bd48]' },
  unfrozen: { accent: 'text-[#b7f34a]', dot: 'bg-[#b7f34a]' },
  released: { accent: 'text-[#b7f34a]', dot: 'bg-[#b7f34a]' },
  refunded: { accent: 'text-[#f9a7a7]', dot: 'bg-[#ef7d7d]' },
} as const;

function initialPublicLocale(): PublicLocale {
  const saved = window.localStorage.getItem(PUBLIC_LOCALE_STORAGE_KEY);
  return isPublicLocale(saved) ? saved : detectPublicLocale(window.navigator.language);
}

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

function PublicAddress({ label, value, href, copyLabel }: { label: string; value: string; href: string; copyLabel: string }) {
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
        <button type="button" onClick={() => void copy()} className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/45 transition hover:border-white/25 hover:text-white" aria-label={`${copyLabel} ${label}`}>
          {copied ? <Check size={16} className="text-[#b7f34a]" /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
}

export function ContractShowcasePage() {
  const [locale, setLocale] = useState<PublicLocale>(initialPublicLocale);
  const [babylonEnabled, setBabylonEnabled] = useState(false);
  const [snapshot, setSnapshot] = useState<ContractPublicSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const heroRef = useRef<HTMLElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  useLandingInteractions(pageRef);
  const snapshotLoadingRef = useRef(false);
  const copy = contractShowcaseCopy[locale];

  useEffect(() => {
    window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => setBabylonEnabled(true), { timeout: 700 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(() => setBabylonEnabled(true), 160);
    return () => window.clearTimeout(timer);
  }, []);

  const loadSnapshot = useCallback(async () => {
    if (snapshotLoadingRef.current) return;
    snapshotLoadingRef.current = true;
    setLoading(true);
    try {
      const next = await readContractPublicSnapshot();
      setSnapshot(next);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '链上状态暂时不可用。');
    } finally {
      snapshotLoadingRef.current = false;
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
      hero.style.setProperty('--hero-scene-progress', progress.toFixed(4));
      hero.style.setProperty('--hero-scene-morph', stageMorph.toFixed(4));
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
  const heldTotal = snapshot?.activityAvailable
    ? snapshot.states.held + snapshot.states.frozen
    : null;

  return (
    <div ref={pageRef} className="contract-home min-h-screen overflow-x-clip bg-[#071016] text-[#eaf1ec]" data-locale={locale}>
      <header className="contract-site-header absolute inset-x-0 top-0 z-20 border-b border-white/[0.07]">
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-5 sm:h-20 sm:px-8 lg:px-12">
          <Link to="/" className="flex shrink-0 items-center gap-3" aria-label={copy.navigation.home}>
            <BrandMark className="size-10" />
            <span className="contract-brand-copy"><strong className="block text-sm tracking-tight">{BRAND.platform.name}</strong><small className="mt-1 hidden font-mono text-[8px] uppercase tracking-[0.2em] text-white/35 sm:block">Open settlement layer</small></span>
          </Link>
          <nav className="flex min-w-0 items-center gap-2" aria-label={copy.navigation.aria}>
            <Link className="hidden rounded-full px-3 py-2 text-xs font-semibold text-white/55 transition hover:text-white md:block" to="/agents">{copy.navigation.browseAgents}</Link>
            <label className="contract-language-picker contract-liquid-glass contract-liquid-glass--pill relative inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] pl-2.5 pr-1.5 text-white/60 transition hover:border-white/20 hover:text-white">
              <Languages size={13} aria-hidden="true" />
              <span className="sr-only">{copy.language.selector}</span>
              <select
                className="h-8 cursor-pointer appearance-none border-0 bg-transparent py-0 pl-0 pr-3 text-[10px] font-semibold text-current outline-none"
                aria-label={copy.language.selector}
                value={locale}
                onChange={(event) => setLocale(event.target.value as PublicLocale)}
              >
                {publicLocaleOptions.map((option) => <option value={option.value} key={option.value}>{option.shortLabel}</option>)}
              </select>
            </label>
            <Link data-magnetic className="contract-liquid-glass contract-liquid-glass--pill inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 px-3 text-[11px] font-semibold text-white transition hover:border-[#32d4e7]/45 hover:bg-[#32d4e7]/10 sm:gap-2 sm:px-4 sm:text-xs" to="/dashboard"><span className="sm:hidden">{copy.navigation.enterPlatformShort}</span><span className="hidden sm:inline">{copy.navigation.enterPlatform}</span> <ArrowRight size={14} /></Link>
          </nav>
        </div>
      </header>

      <main>
        <section ref={heroRef} className="contract-hero relative h-[215svh]">
          <div className="contract-hero__sticky sticky top-0 flex h-[100svh] items-center overflow-hidden">
            {babylonEnabled ? <Suspense fallback={null}><BabylonHeroScene heroRef={heroRef} /></Suspense> : null}
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
                <div className="contract-hero__intro contract-hero__intro--one contract-liquid-glass contract-liquid-glass--status inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/55 backdrop-blur-xl">
                  <span className={`size-1.5 rounded-full ${live ? 'bg-[#b7f34a]' : loading ? 'animate-pulse bg-[#ffd36a]' : 'bg-[#ef7d7d]'}`} />
                  {loading && !snapshot ? copy.hero.connecting : live ? copy.hero.live : snapshot?.paused ? copy.hero.paused : copy.hero.unavailable}
                </div>
                <h1 className="contract-hero__headline-source relative mt-8 max-w-[780px] text-[clamp(3.25rem,7vw,6.8rem)] font-semibold leading-[1.08] tracking-[-0.045em] text-white">
                  <span className="contract-hero__line"><span data-pretext-source>{copy.hero.title[0]}</span></span>
                  <span className="contract-hero__line contract-hero__line--accent"><span data-pretext-source>{copy.hero.title[1]}</span></span>
                  <PretextSignalField text={copy.hero.title} />
                </h1>
                <p className="contract-hero__description-source relative contract-hero__intro contract-hero__intro--two mt-8 max-w-xl text-base leading-8 text-white/50 sm:text-lg">
                  <span data-pretext-source className="block">{copy.hero.description}</span>
                  <PretextSignalField text={copy.hero.description} variant="subtitle" />
                </p>
                <div className="contract-hero__intro contract-hero__intro--three mt-10 flex flex-wrap gap-3">
                  {contractAddress ? <a data-magnetic className="contract-hero__primary inline-flex min-h-12 items-center gap-2 rounded-full bg-[#b7f34a] px-5 text-sm font-semibold text-[#071016] transition" href={explorerUrl('address', contractAddress)} target="_blank" rel="noreferrer">{copy.hero.verify} <ArrowUpRight size={16} /></a> : null}
                  <a data-magnetic className="contract-hero__secondary contract-liquid-glass contract-liquid-glass--pill inline-flex min-h-12 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-white transition" href="#how-it-works">{copy.hero.viewPath} <GitBranch size={16} /></a>
                </div>
                {contractAddress ? <div className="contract-hero__intro contract-hero__intro--four mt-9 flex max-w-xl min-w-0 items-center gap-3 overflow-hidden border-l border-[#32d4e7]/40 pl-4"><span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-white/30">Contract</span><a className="min-w-0 flex-1 truncate font-mono text-xs text-white/60 transition hover:text-[#85e9f7]" href={explorerUrl('address', contractAddress)} target="_blank" rel="noreferrer">{contractAddress}</a></div> : null}
              </div>
            </div>

            <div className="contract-hero__chapter-two">
              <p>SCROLL CHAPTER / 02</p>
              <h2>
                <span className="contract-hero__chapter-line contract-hero__chapter-line--one"><span>{copy.hero.chapterTitle[0]}</span></span>
                <span className="contract-hero__chapter-line contract-hero__chapter-line--two"><span>{copy.hero.chapterTitle[1]}</span></span>
              </h2>
              <div className="contract-hero__chapter-flow" aria-label={copy.hero.pathAria}>
                {[['01', 'LOCK', copy.hero.pathSteps[0]], ['02', 'RUN', copy.hero.pathSteps[1]], ['03', 'SETTLE', copy.hero.pathSteps[2]]].map(([no, code, label]) => <div className="contract-hero__flow-step" key={code}><i>{no}</i><span><small>{code}</small><strong>{label}</strong></span></div>)}
              </div>
            </div>

            <div className="contract-hero__progress" aria-hidden="true">
              <span>01</span><i><b /></i><span>02</span>
            </div>
            <a className="contract-hero__scroll-cue" href="#how-it-works" aria-label={copy.hero.scrollAria}><span />SCROLL TO TRANSFORM</a>
            <div className="contract-hero__exit-band" aria-hidden="true"><span>LIVE PROTOCOL TELEMETRY</span><i /><span>SEPOLIA / BLOCK STREAM</span></div>
          </div>
        </section>

        <section className="contract-reveal-section contract-metrics-glass border-y border-white/[0.08] bg-white/[0.025]" aria-live="polite" data-contract-reveal>
          <div className="mx-auto grid max-w-[1400px] grid-cols-2 px-5 sm:px-8 lg:grid-cols-4 lg:px-12">
            {[
              [copy.metrics.contractStatus, loading && !snapshot ? copy.metrics.syncing : live ? copy.metrics.running : snapshot?.paused ? copy.metrics.paused : copy.metrics.pending, live ? 'BYTECODE PRESENT ONCHAIN' : 'PUBLIC RPC STATUS'],
              [copy.metrics.currentBlock, snapshot ? snapshot.blockNumber.toLocaleString('en-US') : '—', snapshot ? `${snapshot.confirmations.toLocaleString('en-US')} BLOCKS SINCE DEPLOY` : 'READING SEPOLIA'],
              [copy.metrics.protocolFee, snapshot ? `${(snapshot.platformFeeBps / 100).toFixed(2)}%` : '0.40%', 'IMMUTABLE AT DEPLOYMENT'],
              [copy.metrics.onchainEscrow, heldTotal !== null ? `${heldTotal}${copy.metrics.recordsSuffix}` : '—', snapshot?.activityAvailable ? `${snapshot.totalEscrows} TOTAL ESCROWS` : 'EVENT INDEX UNAVAILABLE'],
            ].map(([label, value, detail]) => <div className="contract-glass-metric border-b border-white/[0.08] px-2 py-7 even:border-l sm:px-5 lg:border-b-0 lg:border-l lg:first:border-l-0" key={label}><p className="font-mono text-[9px] uppercase tracking-[0.17em] text-white/30">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p><p className="mt-2 font-mono text-[8px] tracking-[0.12em] text-white/25">{detail}</p></div>)}
          </div>
        </section>

        <section id="how-it-works" className="contract-reveal-section contract-glass-section contract-glass-section--flow mx-auto max-w-[1400px] px-5 py-28 sm:px-8 lg:px-12 lg:py-36" data-contract-reveal>
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#32d4e7]">Protocol flow / 01</p>
            <h2 className="mt-6 text-4xl font-semibold leading-tight tracking-[-0.045em] text-white sm:text-6xl">{copy.flow.heading[0]}<br />{copy.flow.heading[1]}</h2>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/45">{copy.flow.description}</p>
          </div>

          <TaskFlowDemo locale={locale} />

          <div className="mt-12 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch">
            {[
              { no: '01', title: 'Deposit', cn: copy.flow.cards[0].label, text: copy.flow.cards[0].description, icon: LockKeyhole },
              { no: '02', title: 'Held / Frozen', cn: copy.flow.cards[1].label, text: copy.flow.cards[1].description, icon: GitBranch },
              { no: '03', title: 'Release / Refund', cn: copy.flow.cards[2].label, text: copy.flow.cards[2].description, icon: ShieldCheck },
            ].map(({ no, title, cn, text, icon: Icon }, index) => <div data-holographic className="contract-liquid-card group rounded-[2rem] border border-white/[0.09] bg-white/[0.025] p-7 transition hover:border-[#32d4e7]/25 hover:bg-white/[0.04] sm:p-9" key={title}><div className="flex items-center justify-between"><span className="font-mono text-[10px] text-white/25">{no}</span><Icon size={20} className={index === 1 ? 'text-[#ffd36a]' : 'text-[#32d4e7]'} /></div><p className="mt-16 font-mono text-[10px] uppercase tracking-[0.15em] text-white/30">{title}</p><h3 className="mt-3 text-2xl font-semibold text-white">{cn}</h3><p className="mt-4 text-sm leading-7 text-white/40">{text}</p></div>).flatMap((node, index) => index < 2 ? [node, <div className="hidden items-center text-white/20 lg:flex" key={`arrow-${index}`}><ArrowRight size={20} /></div>] : [node])}
          </div>
        </section>

        <section className="contract-reveal-section contract-live-glass-section bg-[#e8eee8] text-[#071016]" data-contract-reveal>
          <div className="mx-auto grid max-w-[1400px] gap-16 px-5 py-28 sm:px-8 lg:grid-cols-[.92fr_1.08fr] lg:px-12 lg:py-36">
            <div className="contract-live-copy-panel">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#087e91]">Live state / 02</p>
              <h2 className="mt-6 text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-6xl">{copy.liveState.heading}</h2>
              <p className="mt-6 max-w-lg text-base leading-8 text-[#4d5a57]">{copy.liveState.description}</p>

              <div className="contract-live-stats mt-14 grid grid-cols-2 gap-x-8 gap-y-10 border-t border-[#071016]/15 pt-8">
                <div className="contract-live-stat"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#071016]/40">{copy.liveState.tokenEscrow}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{snapshot ? formatContractAsset(snapshot.contractTokenBalance, snapshot.tokenDecimals, 2) : '—'}</p><p className="mt-1 text-xs text-[#071016]/45">{snapshot?.tokenSymbol ?? 'mUSDC'}</p></div>
                <div className="contract-live-stat"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#071016]/40">{copy.liveState.nativeEscrow}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{snapshot ? formatContractAsset(snapshot.contractNativeBalance, 18, 4) : '—'}</p><p className="mt-1 text-xs text-[#071016]/45">Sepolia ETH</p></div>
                <div className="contract-live-stat"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#071016]/40">{copy.liveState.totalRecords}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{snapshot?.activityAvailable ? snapshot.totalEscrows : '—'}</p><p className="mt-1 text-xs text-[#071016]/45">Onchain missions</p></div>
                <div className="contract-live-stat"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#071016]/40">{copy.liveState.frozenDisputes}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{snapshot?.activityAvailable ? snapshot.states.frozen : '—'}</p><p className="mt-1 text-xs text-[#071016]/45">Protected escrows</p></div>
              </div>

              {error ? <div className="contract-live-alert mt-10 rounded-2xl border border-[#b85f45]/20 bg-[#b85f45]/10 p-4 text-sm text-[#7b3525]"><p>{copy.liveState.rpcUnavailable}</p><button type="button" className="mt-3 inline-flex items-center gap-2 font-semibold" onClick={() => void loadSnapshot()}><RefreshCw size={14} />{copy.liveState.reconnect}</button></div> : <button type="button" className="mt-10 inline-flex items-center gap-2 text-xs font-semibold text-[#087e91] disabled:opacity-50" onClick={() => void loadSnapshot()} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{snapshot ? `${copy.liveState.updatedAt} ${new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(snapshot.syncedAt))}` : copy.liveState.sync}</button>}
            </div>

            <div className="contract-liquid-panel contract-liquid-panel--deep rounded-[2rem] bg-[#071016] p-6 text-white shadow-[0_35px_90px_rgba(7,16,22,.22)] sm:p-9">
              <div className="flex items-center justify-between border-b border-white/10 pb-6"><div><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/30">Recent protocol activity</p><h3 className="mt-2 text-xl font-semibold">{copy.liveState.recentActivity}</h3></div><Sparkles size={19} className="text-[#32d4e7]" /></div>
              <ol className="mt-2">
                {snapshot?.activityAvailable && snapshot.recentActivity.length ? snapshot.recentActivity.map((item) => {
                  const meta = activityMeta[item.kind];
                  const amount = activityAmount(item, snapshot);
                  return <li className="relative border-b border-white/[0.07] py-5 pl-6 last:border-b-0" key={`${item.transactionHash}-${item.logIndex}`}><span className={`absolute left-0 top-[27px] size-2 rounded-full ${meta.dot}`} /><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className={`text-sm font-semibold ${meta.accent}`}>{copy.liveState.activityLabels[item.kind]}</p><p className="mt-2 truncate font-mono text-[9px] text-white/30">MISSION · {shortHash(item.missionKey, 10, 6)}</p>{amount ? <p className="mt-2 text-xs text-white/55">{amount}</p> : null}</div><a className="flex shrink-0 items-center gap-1 font-mono text-[9px] text-white/30 transition hover:text-white" href={explorerUrl('tx', item.transactionHash)} target="_blank" rel="noreferrer">#{item.blockNumber.toString()} <ExternalLink size={11} /></a></div></li>;
                }) : snapshot ? <li className="py-8 text-sm leading-7 text-white/45" role="status">{snapshot.activityAvailable ? copy.liveState.noRecentActivity : copy.liveState.activityUnavailable}</li> : Array.from({ length: 4 }, (_, index) => <li className="border-b border-white/[0.07] py-5 last:border-b-0" key={index}><div className="h-3 w-32 animate-pulse rounded bg-white/10" /><div className="mt-3 h-2 w-52 animate-pulse rounded bg-white/[0.06]" /></li>)}
              </ol>
            </div>
          </div>
        </section>

        <section className="contract-reveal-section contract-glass-section contract-public-glass-section mx-auto grid max-w-[1400px] gap-16 px-5 py-28 sm:px-8 lg:grid-cols-[1fr_1fr] lg:px-12 lg:py-36" data-contract-reveal>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#32d4e7]">Public record / 03</p>
            <h2 className="mt-6 max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-6xl">{copy.publicRecord.heading[0]}<br />{copy.publicRecord.heading[1]}</h2>
            <div className="mt-12 grid gap-5 sm:grid-cols-3">
              {[
                [KeyRound, copy.publicRecord.features[0].title, copy.publicRecord.features[0].description],
                [Fingerprint, copy.publicRecord.features[1].title, copy.publicRecord.features[1].description],
                [ShieldCheck, copy.publicRecord.features[2].title, copy.publicRecord.features[2].description],
              ].map(([Icon, title, text]) => <article className="contract-feature-glass" key={String(title)}><Icon size={20} className="text-[#b7f34a]" /><h3 className="mt-5 text-base font-semibold">{String(title)}</h3><p className="mt-3 text-xs leading-6 text-white/40">{String(text)}</p></article>)}
            </div>
          </div>

          <div className="contract-liquid-panel rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 sm:p-9">
            {contractAddress ? <PublicAddress label="Escrow contract" value={contractAddress} href={explorerUrl('address', contractAddress)} copyLabel={copy.publicRecord.copy} /> : null}
            {snapshot?.tokenAddress ?? publicContractConfig.configuredTokenAddress ? <PublicAddress label="mUSDC token" value={(snapshot?.tokenAddress ?? publicContractConfig.configuredTokenAddress)!} href={explorerUrl('address', (snapshot?.tokenAddress ?? publicContractConfig.configuredTokenAddress)!)} copyLabel={copy.publicRecord.copy} /> : null}
            {snapshot?.treasury ? <PublicAddress label="Protocol treasury" value={snapshot.treasury} href={explorerUrl('address', snapshot.treasury)} copyLabel={copy.publicRecord.copy} /> : null}
            <div className="border-t border-white/10 py-5"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">Deployment</p><div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/65"><a className="inline-flex items-center gap-1.5 transition hover:text-[#85e9f7]" href={explorerUrl('block', publicContractConfig.deploymentBlock)} target="_blank" rel="noreferrer">Block {publicContractConfig.deploymentBlock.toString()} <ArrowUpRight size={13} /></a>{publicContractConfig.deploymentTransaction ? <a className="inline-flex items-center gap-1.5 transition hover:text-[#85e9f7]" href={explorerUrl('tx', publicContractConfig.deploymentTransaction)} target="_blank" rel="noreferrer">{copy.publicRecord.deploymentTransaction} <ArrowUpRight size={13} /></a> : null}</div></div>
          </div>
        </section>

        <section className="contract-reveal-section contract-cta-section border-t border-white/[0.08]" data-contract-reveal>
          <div className="contract-cta-glass mx-auto flex max-w-[1400px] flex-col gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-end md:justify-between lg:px-12">
            <div><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/25">{BRAND.platform.name} Protocol</p><p className="mt-4 max-w-xl text-2xl font-semibold leading-snug text-white">{copy.cta.description}</p></div>
            <div className="flex flex-wrap gap-3"><Link data-magnetic className="contract-liquid-glass contract-liquid-glass--pill inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-5 text-xs font-semibold transition hover:bg-white/[0.05]" to="/agents">{copy.cta.browseNetwork}</Link><Link data-magnetic className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-xs font-semibold text-[#071016] transition hover:bg-[#b7f34a]" to="/missions/new">{copy.cta.createMission} <ArrowRight size={14} /></Link></div>
          </div>
        </section>
      </main>

      <footer className="contract-glass-footer border-t border-white/[0.06] px-5 py-8 sm:px-8 lg:px-12"><div className="mx-auto flex max-w-[1400px] flex-col gap-3 text-[10px] text-white/25 sm:flex-row sm:items-center sm:justify-between"><span>© 2026 {BRAND.platform.name} · Open settlement on Sepolia</span><span className="inline-flex items-center gap-2">TESTNET ONLY <CirclePlay size={11} /> Public RPC data</span></div></footer>
    </div>
  );
}
