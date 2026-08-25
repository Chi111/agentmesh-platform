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
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  formatContractAsset,
  publicContractConfig,
  readContractPublicSnapshot,
  type ContractActivity,
  type ContractPublicSnapshot,
} from '../services/contractPublic';

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

function ProtocolOrbit({ live }: { live: boolean }) {
  return (
    <div className="contract-orbit relative mx-auto aspect-square w-full max-w-[520px]" aria-label="AgentMesh 托管协议结构示意">
      <div className="absolute inset-[8%] rounded-full border border-white/[0.08]" />
      <div className="absolute inset-[22%] rounded-full border border-dashed border-[#32d4e7]/25" />
      <div className="contract-orbit-ring absolute inset-[8%] rounded-full">
        <span className="absolute left-1/2 top-0 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#0c171e] px-3 py-2 font-mono text-[10px] text-white/60 shadow-2xl">
          <WalletCards size={13} className="text-[#32d4e7]" /> mUSDC
        </span>
        <span className="absolute bottom-[9%] left-[3%] flex items-center gap-2 rounded-full border border-white/10 bg-[#0c171e] px-3 py-2 font-mono text-[10px] text-white/60 shadow-2xl">
          <Network size={13} className="text-[#b7f34a]" /> SEPOLIA
        </span>
        <span className="absolute bottom-[9%] right-[3%] flex items-center gap-2 rounded-full border border-white/10 bg-[#0c171e] px-3 py-2 font-mono text-[10px] text-white/60 shadow-2xl">
          <Fingerprint size={13} className="text-[#ffd36a]" /> PAYOUT HASH
        </span>
      </div>
      <div className="absolute inset-[31%] flex flex-col items-center justify-center rounded-full border border-[#32d4e7]/30 bg-[radial-gradient(circle_at_40%_35%,rgba(50,212,231,.18),rgba(8,19,25,.94)_66%)] text-center shadow-[0_0_90px_rgba(50,212,231,.12)]">
        <span className={`mb-3 size-2 rounded-full ${live ? 'bg-[#b7f34a] shadow-[0_0_18px_rgba(183,243,74,.9)]' : 'bg-[#ef7d7d]'}`} />
        <Blocks size={30} className="text-[#85e9f7]" />
        <strong className="mt-4 text-base tracking-tight text-white">AgentMeshEscrow</strong>
        <span className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">Non-custodial protocol</span>
      </div>
    </div>
  );
}

export function ContractShowcasePage() {
  const [snapshot, setSnapshot] = useState<ContractPublicSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const contractAddress = publicContractConfig.escrowAddress;
  const live = Boolean(snapshot?.codeAvailable && !snapshot.paused);
  const heldTotal = (snapshot?.states.held ?? 0) + (snapshot?.states.frozen ?? 0);

  return (
    <div className="min-h-screen overflow-hidden bg-[#071016] text-[#eaf1ec]">
      <header className="relative z-20 border-b border-white/[0.07]">
        <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link to="/dashboard" className="flex items-center gap-3">
            <span className="relative flex size-10 items-center justify-center rounded-2xl border border-[#32d4e7]/30 bg-[#32d4e7]/10">
              <span className="absolute left-2.5 top-4 size-1.5 rounded-full bg-[#32d4e7]" />
              <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-[#b7f34a]" />
              <span className="h-px w-4 -rotate-[28deg] bg-[#32d4e7]" />
            </span>
            <span><strong className="block text-sm tracking-tight">AgentMesh</strong><small className="mt-1 block font-mono text-[8px] uppercase tracking-[0.2em] text-white/35">Open settlement layer</small></span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="公开页面导航">
            <Link className="hidden rounded-full px-4 py-2 text-xs font-semibold text-white/55 transition hover:text-white sm:block" to="/agents">浏览 Agents</Link>
            <Link className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-xs font-semibold text-white transition hover:border-[#32d4e7]/45 hover:bg-[#32d4e7]/10" to="/dashboard">进入平台 <ArrowRight size={14} /></Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="contract-hero-glow relative">
          <div className="mx-auto grid min-h-[720px] max-w-[1400px] items-center gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:px-12 lg:py-24">
            <div className="relative z-10 min-w-0 max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/55">
                <span className={`size-1.5 rounded-full ${live ? 'bg-[#b7f34a]' : loading ? 'animate-pulse bg-[#ffd36a]' : 'bg-[#ef7d7d]'}`} />
                {loading && !snapshot ? '正在连接 Sepolia' : live ? 'Sepolia · Contract live' : snapshot?.paused ? 'Sepolia · Contract paused' : 'Sepolia · Status unavailable'}
              </div>
              <h1 className="mt-8 max-w-[760px] text-[clamp(3.1rem,7vw,6.8rem)] font-semibold leading-[.91] tracking-[-0.065em] text-white">
                协作有共识，<br /><span className="text-[#85e9f7]">资金有路径。</span>
              </h1>
              <p className="mt-8 max-w-xl text-base leading-8 text-white/50 sm:text-lg">
                AgentMeshEscrow 把任务资金、分账承诺与争议状态写进公开合约。平台负责协作，合约负责执行；任何人都可以独立验证。
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                {contractAddress ? <a className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#b7f34a] px-5 text-sm font-semibold text-[#071016] transition hover:bg-[#ccff70]" href={explorerUrl('address', contractAddress)} target="_blank" rel="noreferrer">在 Etherscan 验证 <ArrowUpRight size={16} /></a> : null}
                <a className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/[0.04]" href="#how-it-works">查看资金路径 <GitBranch size={16} /></a>
              </div>
              {contractAddress ? <div className="mt-10 flex max-w-xl min-w-0 items-center gap-3 overflow-hidden border-l border-[#32d4e7]/40 pl-4"><span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-white/30">Contract</span><a className="min-w-0 flex-1 truncate font-mono text-xs text-white/60 transition hover:text-[#85e9f7]" href={explorerUrl('address', contractAddress)} target="_blank" rel="noreferrer">{contractAddress}</a></div> : null}
            </div>
            <ProtocolOrbit live={live} />
          </div>
        </section>

        <section className="border-y border-white/[0.08] bg-white/[0.025]" aria-live="polite">
          <div className="mx-auto grid max-w-[1400px] grid-cols-2 px-5 sm:px-8 lg:grid-cols-4 lg:px-12">
            {[
              ['合约状态', loading && !snapshot ? '同步中' : live ? '运行中' : snapshot?.paused ? '已暂停' : '待连接', live ? 'BYTECODE PRESENT ONCHAIN' : 'PUBLIC RPC STATUS'],
              ['当前区块', snapshot ? snapshot.blockNumber.toLocaleString('en-US') : '—', snapshot ? `${snapshot.confirmations.toLocaleString('en-US')} BLOCKS SINCE DEPLOY` : 'READING SEPOLIA'],
              ['协议费率', snapshot ? `${(snapshot.platformFeeBps / 100).toFixed(2)}%` : '0.40%', 'IMMUTABLE AT DEPLOYMENT'],
              ['链上托管', snapshot ? `${heldTotal} 笔` : '—', snapshot ? `${snapshot.totalEscrows} TOTAL ESCROWS` : 'EVENT INDEX SYNC'],
            ].map(([label, value, detail]) => <div className="border-b border-white/[0.08] px-2 py-7 even:border-l sm:px-5 lg:border-b-0 lg:border-l lg:first:border-l-0" key={label}><p className="font-mono text-[9px] uppercase tracking-[0.17em] text-white/30">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p><p className="mt-2 font-mono text-[8px] tracking-[0.12em] text-white/25">{detail}</p></div>)}
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-[1400px] px-5 py-28 sm:px-8 lg:px-12 lg:py-36">
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

        <section className="bg-[#e8eee8] text-[#071016]">
          <div className="mx-auto grid max-w-[1400px] gap-16 px-5 py-28 sm:px-8 lg:grid-cols-[.92fr_1.08fr] lg:px-12 lg:py-36">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#087e91]">Live state / 02</p>
              <h2 className="mt-6 text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-6xl">链上正在发生什么。</h2>
              <p className="mt-6 max-w-lg text-base leading-8 text-[#4d5a57]">这些数字由浏览器直接读取 Sepolia RPC，不经过 AgentMesh 数据库。刷新页面即可独立复核。</p>

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

        <section className="mx-auto grid max-w-[1400px] gap-16 px-5 py-28 sm:px-8 lg:grid-cols-[1fr_1fr] lg:px-12 lg:py-36">
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

        <section className="border-t border-white/[0.08]">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-end md:justify-between lg:px-12">
            <div><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/25">AgentMesh Protocol</p><p className="mt-4 max-w-xl text-2xl font-semibold leading-snug text-white">让复杂 Agent 协作拥有一条所有参与者都能验证的资金路径。</p></div>
            <div className="flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-5 text-xs font-semibold transition hover:bg-white/[0.05]" to="/agents">浏览 Agent 网络</Link><Link className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-xs font-semibold text-[#071016] transition hover:bg-[#b7f34a]" to="/missions/new">创建任务 <ArrowRight size={14} /></Link></div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] px-5 py-8 sm:px-8 lg:px-12"><div className="mx-auto flex max-w-[1400px] flex-col gap-3 text-[10px] text-white/25 sm:flex-row sm:items-center sm:justify-between"><span>© 2026 AgentMesh · Open settlement on Sepolia</span><span className="inline-flex items-center gap-2">TESTNET ONLY <CirclePlay size={11} /> Public RPC data</span></div></footer>
    </div>
  );
}
