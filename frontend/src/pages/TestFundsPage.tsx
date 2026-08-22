import { ArrowUpRight, Coins, CreditCard, ExternalLink, History, LoaderCircle, ShieldCheck, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../services/api';
import type { WalletAccount } from '../types/domain';

const transactionLabels: Record<WalletAccount['transactions'][number]['type'], string> = {
  test_topup: '测试充值',
  mission_hold: '任务托管',
  agent_payout: 'Agent 收益',
  refund: '托管退款',
};

function nextClaimText(nextAt: string | null) {
  if (!nextAt) return '现在可以领取';
  const remaining = Date.parse(nextAt) - Date.now();
  if (remaining <= 0) return '现在可以领取';
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.ceil((remaining % 3_600_000) / 60_000);
  return `${hours} 小时 ${minutes} 分钟后可再次领取`;
}

export function TestFundsPage() {
  const { profile, status } = useAuth();
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canClaim = useMemo(() => !account?.nextTestTopupAt || Date.parse(account.nextTestTopupAt) <= Date.now(), [account?.nextTestTopupAt]);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    setError('');
    try {
      setAccount(await api.getWalletAccount());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '余额加载失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [profile?.id]);

  const claim = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const result = await api.claimTestCredit();
      setAccount(result.account);
      setMessage(result.credited ? `已充值 ${result.account.testTopupAmount} CREDIT。` : '本轮测试充值已领取，请稍后再试。');
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : '测试充值失败。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Test Funds"
        title="测试网资金中心"
        description="Web2 任务使用测试余额；Web3 任务使用 Sepolia 测试资产。所有资金仅用于当前测试网正式流程，不代表真实法币或可提现资产。"
        actions={<Link className="btn-secondary" to="/missions/new"><ArrowUpRight size={16} />发布任务</Link>}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-5 md:p-6">
          <div className="flex items-center gap-3 border-b border-line pb-5">
            <span className="flex size-11 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><CreditCard size={20} /></span>
            <div><h2 className="font-semibold">Web2 测试余额</h2><p className="mt-1 text-xs text-muted">每个已登录账户每 24 小时可领取一次固定体验额度。</p></div>
          </div>

          {status !== 'authenticated' || !profile ? <div className="mt-6 rounded-xl border border-dashed border-line bg-canvas p-6 text-center"><p className="text-sm font-semibold">请先登录账户</p><p className="mt-2 text-xs leading-5 text-muted">登录后即可领取写入 D1 账户的测试余额。</p></div> : <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="mesh-grid rounded-2xl bg-ink p-5 text-white"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">Available Balance</p><p className="mt-4 font-mono text-4xl font-semibold">{account?.balance.toLocaleString() ?? '—'} <span className="text-sm text-cyan">CREDIT</span></p><p className="mt-3 text-xs leading-5 text-white/40">启动 Web2 任务时锁定，验收后结算给 Agent 开发者。</p></div>
              <div className="rounded-2xl border border-line bg-canvas/50 p-5"><p className="text-xs text-muted">本次可领取</p><p className="mt-3 font-mono text-2xl font-semibold">+{account?.testTopupAmount ?? 100} CREDIT</p><p className="mt-3 text-xs text-muted">{nextClaimText(account?.nextTestTopupAt ?? null)}</p><button type="button" className="btn-signal mt-5 w-full" onClick={() => void claim()} disabled={loading || !account || !canClaim}>{loading ? <LoaderCircle size={16} className="animate-spin" /> : <Coins size={16} />}{canClaim ? '领取测试充值' : '等待下次领取'}</button></div>
            </div>
            {message ? <p className="mt-4 rounded-xl border border-lime/30 bg-lime/10 p-3 text-sm">{message}</p> : null}
            {error ? <p className="mt-4 rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

            <div className="mt-7 border-t border-line pt-5"><div className="flex items-center gap-2"><History size={17} /><h3 className="font-semibold">余额流水</h3></div>{account?.transactions.length ? <div className="mt-4 divide-y divide-line">{account.transactions.map((transaction) => <div className="flex items-center justify-between gap-4 py-3" key={transaction.id}><div><p className="text-sm font-semibold">{transactionLabels[transaction.type]}</p><p className="mt-1 font-mono text-[9px] text-muted">{transaction.missionId ?? '体验账户'} · {new Date(transaction.createdAt).toLocaleString('zh-CN', { hour12: false })}</p></div><span className={`font-mono text-sm font-semibold ${transaction.amount > 0 ? 'text-cyan' : 'text-ink'}`}>{transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString()} CREDIT</span></div>)}</div> : <p className="mt-4 rounded-xl bg-canvas p-5 text-center text-xs text-muted">暂无余额流水，领取后会显示在这里。</p>}</div>
          </>}
        </section>

        <aside className="space-y-4">
          <section className="panel p-5"><div className="flex items-center gap-2"><WalletCards size={18} /><h2 className="font-semibold">Web3 测试资产</h2></div><p className="mt-3 text-xs leading-5 text-muted">mUSDC 复用 Web3 大学的 Sepolia 合约和水龙头；sETH 是 Sepolia 原生测试 ETH。</p><a className="btn-primary mt-5 w-full" href="https://web3-university-faucet.pinit.eth.limo" target="_blank" rel="noreferrer">领取 100 mUSDC <ExternalLink size={15} /></a><a className="btn-secondary mt-3 w-full" href="https://ethereum.org/en/developers/docs/networks/#sepolia" target="_blank" rel="noreferrer">查看 Sepolia 水龙头 <ExternalLink size={15} /></a></section>
          <section className="rounded-2xl border border-lime/25 bg-lime/10 p-5"><p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={17} />测试资金说明</p><ul className="mt-3 space-y-2 text-xs leading-5 text-muted"><li>• CREDIT 仅是站内测试记账单位。</li><li>• mUSDC 与 sETH 仅运行在 Sepolia。</li><li>• 平台不会索取或保存钱包私钥。</li></ul></section>
        </aside>
      </div>
    </div>
  );
}
