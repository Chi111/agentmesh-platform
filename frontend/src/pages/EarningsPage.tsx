import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CircleDollarSign,
  Download,
  Landmark,
  LoaderCircle,
  RefreshCw,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import type { DeveloperLedger, LedgerEntry } from '../types/domain';

const emptyLedger: DeveloperLedger = {
  token: 'CREDIT',
  entries: [],
  totals: { settled: 0, pending: 0, failed: 0 },
  weekly: [],
  pageInfo: { hasMore: false, nextCursor: null },
};

function startOfWeek(value: Date) {
  const date = new Date(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function weeklySeries(entries: LedgerEntry[], now = new Date()) {
  const currentWeek = startOfWeek(now);
  return Array.from({ length: 12 }, (_, index) => {
    const start = new Date(currentWeek);
    start.setDate(start.getDate() - (11 - index) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const amount = entries.reduce((sum, entry) => {
      const createdAt = new Date(entry.createdAt);
      return entry.status === 'settled' && createdAt >= start && createdAt < end
        ? sum + (entry.entryType === 'refund' ? -entry.amount : entry.amount)
        : sum;
    }, 0);
    return { key: start.toISOString(), label: `${start.getMonth() + 1}/${start.getDate()}`, amount };
  });
}

function serverWeeklySeries(points: DeveloperLedger['weekly'], now = new Date()) {
  const amounts = new Map(points.map((point) => [point.weekStart, point.amount]));
  return weeklySeries([], now).map((item) => ({
    ...item,
    amount: amounts.get(item.key.slice(0, 10)) ?? 0,
  }));
}

function mergeEntries(current: LedgerEntry[], incoming: LedgerEntry[]) {
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of incoming) byId.set(entry.id, entry);
  return [...byId.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
}

function csvCell(value: string | number) {
  const source = String(value);
  const text = typeof value === 'string' && /^[=+\-@]/.test(source) ? `'${source}` : source;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadStatement(entries: LedgerEntry[]) {
  const headers = ['账目编号', '任务编号', '任务名称', 'Agent', '类型', '金额', '币种', '状态', '交易哈希', '记账时间'];
  const rows = entries.map((entry) => [entry.id, entry.missionId, entry.missionTitle, entry.agentName, entry.entryType, entry.amount, entry.token, entry.status, entry.txHash ?? '', entry.createdAt]);
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `agentmesh-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

const entryLabels: Record<LedgerEntry['entryType'], string> = {
  agent_payout: 'Agent 任务结算',
  refund: '资金退回',
  yield: '收益入账',
};

export function EarningsPage() {
  const summary = useAppStore((state) => state.developerSummary);
  const showToast = useAppStore((state) => state.showToast);
  const [ledger, setLedger] = useState<DeveloperLedger>(emptyLedger);
  const [token, setToken] = useState<'CREDIT' | 'mUSDC' | 'sETH'>('CREDIT');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLedger(await api.getDeveloperLedger(40, null, token));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '账本同步失败。');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadLedger(); }, [loadLedger]);

  const series = useMemo(() => serverWeeklySeries(ledger.weekly), [ledger.weekly]);
  const maxSeriesAmount = Math.max(1, ...series.map((item) => item.amount));
  const hasSeries = series.some((item) => item.amount > 0);
  const volume = ledger.totals.settled;
  const pending = ledger.totals.pending;
  const protocolFee = volume * 0.004;

  const loadMore = async () => {
    if (!ledger.pageInfo.nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await api.getDeveloperLedger(40, ledger.pageInfo.nextCursor, token);
      setLedger((current) => ({ ...page, entries: mergeEntries(current.entries, page.entries) }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '更多账目加载失败。');
    } finally {
      setLoadingMore(false);
    }
  };

  const exportCsv = async () => {
    if (!ledger.entries.length) return;
    setExporting(true);
    try {
      let entries = ledger.entries;
      let cursor = ledger.pageInfo.nextCursor;
      while (cursor && entries.length < 5_000) {
        const page = await api.getDeveloperLedger(100, cursor, token);
        entries = mergeEntries(entries, page.entries);
        cursor = page.pageInfo.nextCursor;
      }
      downloadStatement(entries);
      setLedger((current) => ({ ...current, entries, pageInfo: { hasMore: Boolean(cursor), nextCursor: cursor } }));
      showToast(cursor ? `已导出前 ${entries.length} 条账目；超大账本请使用服务端报表。` : `已导出全部 ${entries.length} 条账目。`, 'success');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '账本导出失败。');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Developer / Treasury"
        title="收益中心"
        description="基于 D1 逐笔账本查看结算、趋势与交易引用，并导出可核对的 CSV 对账单。"
        actions={<button type="button" className="btn-secondary" onClick={() => void exportCsv()} disabled={loading || exporting || ledger.entries.length === 0}>{exporting ? <LoaderCircle className="animate-spin" size={16} /> : <Download size={16} />}{exporting ? '准备完整账本…' : '导出 CSV'}</button>}
      />

      <div className="flex flex-wrap gap-2" aria-label="选择结算资产">
        {(['CREDIT', 'mUSDC', 'sETH'] as const).map((item) => <button key={item} type="button" className={item === token ? 'btn-primary' : 'btn-secondary'} onClick={() => setToken(item)}>{item}</button>)}
      </div>

      {error ? <div className="flex flex-col gap-3 rounded-xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger sm:flex-row sm:items-center sm:justify-between" role="alert"><span className="inline-flex items-center gap-2"><AlertTriangle size={16} />{error}</span><button type="button" className="btn-secondary shrink-0" onClick={() => void loadLedger()}><RefreshCw size={15} />重试</button></div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="累计成交额" value={`${volume.toLocaleString()} ${token}`} detail={`账本已结算 ${ledger.totals.settled.toLocaleString()} ${token}`} icon={CircleDollarSign} signal="lime" />
        <MetricCard label="待结算" value={`${pending.toLocaleString()} ${token}`} detail="来自当前资产账本" icon={WalletCards} signal="cyan" />
        <MetricCard label="活跃 Agent" value={String(summary?.activeAgents ?? 0)} detail={`累计 ${summary?.jobs ?? 0} 个任务`} icon={TrendingUp} signal="lime" />
        <MetricCard label="协议费估算" value={`${protocolFee.toFixed(token === 'sETH' ? 6 : 2)} ${token}`} detail="按 0.4% 展示" icon={Landmark} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">近 12 周结算趋势</h2><p className="mt-1 text-xs text-muted">服务端聚合全部 settled 账目，不受当前分页影响</p></div><StatusBadge tone="success">D1 VERIFIED</StatusBadge></div>
          {loading ? <div className="flex h-64 items-center justify-center text-sm text-muted"><LoaderCircle className="mr-2 animate-spin" size={18} />同步账本…</div> : hasSeries ? <div className="mt-7" role="img" aria-label="过去十二周已结算收益柱状图">
            <div className="flex h-52 items-end gap-1.5 border-b border-line sm:gap-2">{series.map((item, index) => <div className="group relative flex h-full flex-1 items-end" key={item.key}><span className={`block w-full rounded-t-md transition group-hover:bg-cyan ${index === series.length - 1 ? 'bg-cyan' : 'bg-ink/75'}`} style={{ height: `${Math.max(4, (item.amount / maxSeriesAmount) * 184)}px` }} /><span className="pointer-events-none absolute -top-1 left-1/2 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-ink px-2 py-1 font-mono text-[9px] text-white group-hover:block">{item.amount.toFixed(token === 'sETH' ? 6 : 2)} {token}</span></div>)}</div>
            <div className="mt-3 grid grid-cols-4 font-mono text-[9px] text-muted"><span>{series[0].label}</span><span>{series[4].label}</span><span>{series[8].label}</span><span className="text-right">{series[11].label}</span></div>
          </div> : <div className="mt-7 flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-canvas/35 text-center"><TrendingUp size={28} className="text-cyan" /><p className="mt-4 text-sm font-semibold">还没有已结算账目</p><p className="mt-2 max-w-md text-xs leading-5 text-muted">任务完成验收并释放资金后，趋势会自动从 D1 账本生成。</p></div>}
        </section>

        <section className="mesh-grid rounded-2xl border border-white/10 bg-ink p-5 text-white"><p className="eyebrow !text-cyan">Settlement Ledger</p><p className="mt-4 font-mono text-lg font-semibold">D1 / {token}</p><p className="mt-2 text-xs text-white/40">按资产隔离汇总 · 可保留链上交易引用</p><div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-white/40">已结算余额</p><p className="mt-2 font-mono text-3xl font-semibold">{ledger.totals.settled.toLocaleString()} <span className="text-sm text-white/40">{token}</span></p></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/5 p-3"><p className="text-[9px] text-white/35">PENDING</p><p className="mt-2 font-mono text-sm">{ledger.totals.pending.toLocaleString()}</p></div><div className="rounded-xl bg-white/5 p-3"><p className="text-[9px] text-white/35">FAILED</p><p className="mt-2 font-mono text-sm">{ledger.totals.failed.toLocaleString()}</p></div></div><p className="mt-4 text-[10px] leading-5 text-white/35">mUSDC 与 sETH 仅在 Sepolia 测试网结算；平台不会代管钱包私钥。</p></section>
      </div>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="font-semibold">资金流水</h2><p className="mt-1 text-xs text-muted">已加载 {ledger.entries.length} 条可核对记录{ledger.pageInfo.hasMore ? ' · 还有更多' : ''}</p></div>{loading ? <LoaderCircle className="animate-spin text-muted" size={17} /> : null}</div>
        {ledger.entries.length ? <div className="divide-y divide-line">{ledger.entries.map((entry) => {
          const outgoing = entry.entryType === 'refund';
          return <article className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center" key={entry.id}><span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${outgoing ? 'bg-canvas' : 'bg-lime/20'}`}>{outgoing ? <ArrowUpRight size={17} /> : <ArrowDownLeft size={17} />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{entryLabels[entry.entryType]}</p><StatusBadge tone={entry.status === 'settled' ? 'success' : entry.status === 'failed' ? 'danger' : 'warning'}>{entry.status.toUpperCase()}</StatusBadge></div><p className="mt-1 truncate text-xs text-muted">{entry.missionTitle} · {entry.agentName}</p><p className="mt-1 font-mono text-[9px] text-muted">{entry.missionId} · {new Date(entry.createdAt).toLocaleString('zh-CN', { hour12: false })}</p>{entry.txHash ? <p className="mt-1 truncate font-mono text-[9px] text-cyan" title={entry.txHash}>TX {entry.txHash}</p> : null}</div><span className={`font-mono text-sm font-semibold ${outgoing ? 'text-muted' : 'text-ink'}`}>{outgoing ? '-' : '+'}{entry.amount.toFixed(2)} {entry.token}</span></article>;
        })}</div> : !loading ? <div className="px-5 py-12 text-center"><p className="text-sm font-semibold">暂无资金流水</p><p className="mt-2 text-xs text-muted">完成第一笔任务结算后即可在这里查询和导出。</p></div> : null}
        {ledger.pageInfo.hasMore ? <div className="border-t border-line px-5 py-4 text-center"><button type="button" className="btn-secondary" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? <LoaderCircle className="animate-spin" size={15} /> : null}{loadingMore ? '加载中…' : '加载更多账目'}</button></div> : null}
      </section>
    </div>
  );
}
