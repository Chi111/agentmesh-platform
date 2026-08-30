import {
  Bell,
  CheckCircle2,
  CloudUpload,
  Database,
  Eye,
  EyeOff,
  Globe2,
  LoaderCircle,
  Mail,
  Server,
  ShieldCheck,
  Trash2,
  UserRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { BRAND } from '../constants/brand';
import { api } from '../services/api';
import { shortWalletAddress } from '../services/ens';
import { useAppStore } from '../store/useAppStore';
import type { PinmeIntegrationStatus, UserPreferences } from '../types/domain';

type SettingsSection = 'profile' | 'notifications' | 'wallet' | 'integrations' | 'security' | 'privacy' | 'locale';

const settingsSections: ReadonlyArray<{ id: SettingsSection; icon: LucideIcon; label: string }> = [
  { id: 'profile', icon: UserRound, label: '个人资料' },
  { id: 'notifications', icon: Bell, label: '通知偏好' },
  { id: 'wallet', icon: WalletCards, label: '钱包与结算' },
  { id: 'integrations', icon: CloudUpload, label: 'PinMe 自动交付' },
  { id: 'security', icon: ShieldCheck, label: '安全' },
  { id: 'privacy', icon: Database, label: '数据与隐私' },
  { id: 'locale', icon: Globe2, label: '语言与地区' },
];

const defaultPreferences: UserPreferences = {
  taskUpdates: true,
  settlementUpdates: true,
  productUpdates: false,
  emailChannel: true,
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  updatedAt: '',
};

const emptyPinmeStatus: PinmeIntegrationStatus = { configured: false, addressHint: null, updatedAt: null };

function Toggle({ enabled, onChange, label, disabled = false }: { enabled: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={enabled} aria-label={label} disabled={disabled} onClick={onChange} className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-45 ${enabled ? 'bg-cyan' : 'bg-line'}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition ${enabled ? 'left-6' : 'left-1'}`} /></button>;
}

function FactRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="grid gap-1 border-b border-line py-4 last:border-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center"><span className="text-xs text-muted">{label}</span><span className={`break-words text-sm font-semibold ${mono ? 'font-mono text-xs' : ''}`}>{value}</span></div>;
}

export function SettingsPage() {
  const showToast = useAppStore((state) => state.showToast);
  const { profile, provider, linkedWalletAddress, walletAddress, ensName, linkWallet } = useAuth();
  const identityWallet = walletAddress ?? linkedWalletAddress;
  const walletLabel = ensName ?? shortWalletAddress(identityWallet);
  const [section, setSection] = useState<SettingsSection>('profile');
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [savedPreferences, setSavedPreferences] = useState<UserPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [pinmeStatus, setPinmeStatus] = useState<PinmeIntegrationStatus>(emptyPinmeStatus);
  const [pinmeAppKey, setPinmeAppKey] = useState('');
  const [showPinmeAppKey, setShowPinmeAppKey] = useState(false);
  const [savingPinme, setSavingPinme] = useState(false);
  const [removingPinme, setRemovingPinme] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!profile) {
      setPreferences(defaultPreferences);
      setSavedPreferences(defaultPreferences);
      setPinmeStatus(emptyPinmeStatus);
      setPinmeAppKey('');
      setError(null);
      return () => { cancelled = true; };
    }
    setLoading(true);
    setError(null);
    void Promise.all([api.getPreferences(), api.getPinmeIntegration()])
      .then(([next, integration]) => {
        if (cancelled) return;
        setPreferences(next);
        setSavedPreferences(next);
        setPinmeStatus(integration);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : '设置同步失败。');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile]);

  const dirty = JSON.stringify({ ...preferences, updatedAt: '' }) !== JSON.stringify({ ...savedPreferences, updatedAt: '' });
  const updatePreference = <Key extends keyof UserPreferences>(key: Key, value: UserPreferences[Key]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const savePreferences = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!profile) throw new Error('工作区身份尚未就绪，请重新登录。');
      const { updatedAt: _updatedAt, ...input } = preferences;
      const saved = await api.updatePreferences(input);
      setPreferences(saved);
      setSavedPreferences(saved);
      showToast('工作区设置已持久化到 D1。', 'success');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '设置保存失败。');
    } finally {
      setSaving(false);
    }
  };

  const testEmail = async () => {
    if (!profile?.email) return;
    setTestingEmail(true);
    setError(null);
    try {
      const result = await api.testNotificationEmail();
      showToast(`测试邮件已发送到 ${result.recipient}`, 'success');
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : '邮件通道测试失败。');
    } finally {
      setTestingEmail(false);
    }
  };

  const savePinmeAppKey = async () => {
    if (!pinmeAppKey.trim()) return;
    setSavingPinme(true);
    setError(null);
    try {
      if (!profile) throw new Error('工作区身份尚未就绪，请重新登录。');
      const saved = await api.savePinmeIntegration(pinmeAppKey.trim());
      setPinmeStatus(saved);
      setPinmeAppKey('');
      setShowPinmeAppKey(false);
      showToast('PinMe AppKey 已加密保存，自动交付已启用。', 'success');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'PinMe AppKey 保存失败。');
    } finally {
      setSavingPinme(false);
    }
  };

  const removePinmeAppKey = async () => {
    if (!window.confirm('移除后，新的官方 Agent 任务将无法自动发布到你的 PinMe 账户。已生成的 CID 不受影响。确认移除？')) return;
    setRemovingPinme(true);
    setError(null);
    try {
      setPinmeStatus(await api.deletePinmeIntegration());
      setPinmeAppKey('');
      showToast('PinMe 自动交付配置已移除。', 'success');
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'PinMe 配置移除失败。');
    } finally {
      setRemovingPinme(false);
    }
  };

  const saveBar = <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted">{savedPreferences.updatedAt ? `上次保存：${new Date(savedPreferences.updatedAt).toLocaleString('zh-CN', { hour12: false })}` : '首次保存后会同步到 D1'}</p><button type="button" className="btn-primary" disabled={!dirty || saving || loading} onClick={() => void savePreferences()}>{saving ? <LoaderCircle className="animate-spin" size={16} /> : null}{saving ? '保存中…' : dirty ? '保存更改' : '已保存'}</button></div>;

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Workspace Settings" title="设置" description={`管理身份、通知、钱包与工作区偏好。真实设置由 ${BRAND.platform.name} Worker 鉴权并持久化到 D1。`} />
      <section className="flex flex-col gap-4 rounded-2xl border border-cyan/25 bg-cyan/[0.055] p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-cyan"><CheckCircle2 size={18} /></span><div><p className="text-sm font-semibold">正式工作区已连接</p><p className="mt-1 text-xs text-muted">{profile ? `${ensName ?? profile.displayName} · ${profile.email ?? walletLabel ?? '无邮箱'}` : '正在同步账户身份…'}</p></div></div>
        <span className="mono-chip">WORKER + D1</span>
      </section>

      {error ? <p className="rounded-xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger" role="alert">{error}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="panel self-start p-2" aria-label="设置分类">
          {settingsSections.map(({ id, icon: Icon, label }) => <button type="button" className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${section === id ? 'bg-cyan/10 font-semibold text-ink' : 'text-muted hover:bg-canvas hover:text-ink'}`} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)} key={id}><Icon size={17} />{label}</button>)}
        </nav>

        <section className="panel p-5 md:p-6" aria-live="polite">
          {loading ? <div className="flex min-h-64 items-center justify-center text-sm text-muted"><LoaderCircle className="mr-2 animate-spin" size={18} />同步工作区设置…</div> : null}

          {!loading && section === 'profile' ? <><div className="border-b border-line pb-4"><h2 className="font-semibold">个人资料</h2><p className="mt-1 text-xs text-muted">身份字段由已验证的登录账户提供，避免浏览器伪造。</p></div><div className="mt-2"><FactRow label="显示名称" value={ensName ?? profile?.displayName ?? '未命名账户'} />{identityWallet ? <FactRow label="ENS 主名称" value={ensName ?? '未设置'} /> : null}<FactRow label="邮箱" value={profile?.email ?? '未关联邮箱'} /><FactRow label="平台角色" value={profile?.role === 'admin' ? '平台管理员' : profile?.role === 'developer' ? 'Agent 开发者' : '任务方'} /><FactRow label="身份提供方" value={provider === 'privy' ? 'Privy · Web2 / Web3' : `${BRAND.evidence.providerName} Identity · Web2`} /><FactRow label="Profile ID" value={profile?.id ?? '正在同步'} mono /></div></> : null}

          {!loading && section === 'notifications' ? <><div className="border-b border-line pb-4"><h2 className="font-semibold">通知偏好</h2><p className="mt-1 text-xs text-muted">控制站内和邮件通知。业务必需的安全通知不受营销开关影响。</p></div><div className="divide-y divide-line">{[
            { key: 'taskUpdates' as const, title: '任务执行更新', detail: 'Agent 状态、阶段完成、重试与异常' },
            { key: 'settlementUpdates' as const, title: '验收与结算', detail: '交付待验收、资金释放与争议状态' },
            { key: 'productUpdates' as const, title: '产品更新', detail: '新功能、Agent 生态与社区活动' },
            { key: 'emailChannel' as const, title: '邮件通道', detail: '允许把已订阅事件同步到认证邮箱' },
          ].map((item) => <div className="flex items-center justify-between gap-5 py-5" key={item.key}><div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted">{item.detail}</p></div><Toggle enabled={preferences[item.key]} onChange={() => updatePreference(item.key, !preferences[item.key])} label={item.title} /></div>)}</div><div className="mt-5 flex flex-col gap-3 rounded-xl border border-line bg-canvas p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><Mail className="mt-0.5 shrink-0 text-cyan" size={17} /><div><p className="text-sm font-semibold">验证邮件通道</p><p className="mt-1 text-xs leading-5 text-muted">{profile?.email ? `向认证邮箱 ${profile.email} 发送一封通道测试邮件。` : '当前身份没有可用邮箱，钱包账户可先关联邮箱。'}</p></div></div><button type="button" className="btn-secondary shrink-0" disabled={!profile?.email || testingEmail} onClick={() => void testEmail()}>{testingEmail ? <LoaderCircle className="animate-spin" size={15} /> : null}{testingEmail ? '发送中…' : '发送测试邮件'}</button></div>{saveBar}</> : null}

          {!loading && section === 'wallet' ? <><div className="border-b border-line pb-4"><h2 className="font-semibold">钱包与结算</h2><p className="mt-1 text-xs text-muted">Web2 登录与 Web3 外部钱包独立；{BRAND.platform.name} 不创建或托管钱包私钥。</p></div><div className="mt-5 grid gap-4 md:grid-cols-2"><article className="rounded-2xl border border-line bg-canvas p-4"><div className="flex items-center justify-between gap-3"><WalletCards size={19} className="text-cyan" />{ensName ? <span className="mono-chip">ENS VERIFIED</span> : null}</div><p className="mt-4 text-sm font-semibold">{ensName ?? (walletAddress ? 'Web3 外部钱包已连接' : linkedWalletAddress ? '外部钱包已绑定但连接中断' : '尚未关联外部钱包')}</p><p className="mt-2 break-all font-mono text-[10px] leading-5 text-muted">{identityWallet ?? 'Google/邮箱登录不会生成钱包；需要链上支付时再主动关联 MetaMask 等外部钱包。'}</p>{identityWallet ? <p className="mt-3 text-[10px] leading-5 text-muted">ENS 主名称通过 Ethereum Mainnet Universal Resolver 反向解析并验证；未设置时保留钱包地址。</p> : null}{profile && provider === 'privy' && !walletAddress ? <button type="button" className="btn-secondary mt-4" onClick={() => void linkWallet()}>{linkedWalletAddress ? '重新连接钱包' : '关联外部钱包'}</button> : null}</article><article className="rounded-2xl border border-line bg-canvas p-4"><Server size={19} className="text-cyan" /><p className="mt-4 text-sm font-semibold">Token（CREDIT） / mUSDC / sETH</p><p className="mt-2 text-xs leading-5 text-muted">Web2 只扣站内 Token（CREDIT）余额；Web3 只使用 Sepolia mUSDC 或 sETH，并由 Worker 校验托管事件。</p><span className="mono-chip mt-4">SEPARATE PAYMENT RAILS</span></article></div></> : null}

          {!loading && section === 'integrations' ? <><div className="border-b border-line pb-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">PinMe 自动交付</h2><p className="mt-1 text-xs text-muted">配置你自己的 PinMe AppKey。官方 Agent 完成后会把 HTML、Markdown 和 Manifest 自动上传到你的 PinMe/IPFS 空间。</p></div><span className={`mono-chip ${pinmeStatus.configured ? '!border-lime/40 !text-lime-700' : ''}`}>{pinmeStatus.configured ? 'AUTO DELIVERY ON' : 'NOT CONFIGURED'}</span></div></div><div className="mt-5 rounded-2xl border border-cyan/25 bg-cyan/[0.045] p-5"><div className="flex items-start gap-3"><CloudUpload className="mt-0.5 shrink-0 text-cyan" size={19} /><div><p className="text-sm font-semibold">{pinmeStatus.configured ? '已连接你的 PinMe 账户' : '连接 PinMe 账户'}</p><p className="mt-1 text-xs leading-5 text-muted">{pinmeStatus.configured ? `账户 ${pinmeStatus.addressHint ?? '已配置'} · ${pinmeStatus.updatedAt ? `更新于 ${new Date(pinmeStatus.updatedAt).toLocaleString('zh-CN', { hour12: false })}` : '已加密保存'}` : 'AppKey 只在保存请求中传给 Worker，使用 AES-GCM 加密后写入 D1；接口不会返回明文。'}</p></div></div><label className="mt-5 block"><span className="field-label">{pinmeStatus.configured ? '替换 AppKey' : 'PinMe AppKey'}</span><div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><input className="field w-full pr-11 font-mono text-xs" type={showPinmeAppKey ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} value={pinmeAppKey} onChange={(event) => setPinmeAppKey(event.target.value)} placeholder="<address>-<token>" /><button type="button" className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-ink" aria-label={showPinmeAppKey ? '隐藏 AppKey' : '显示 AppKey'} onClick={() => setShowPinmeAppKey((value) => !value)}>{showPinmeAppKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></div><button type="button" className="btn-primary shrink-0" disabled={!pinmeAppKey.trim() || savingPinme} onClick={() => void savePinmeAppKey()}>{savingPinme ? <LoaderCircle className="animate-spin" size={16} /> : <CloudUpload size={16} />}{pinmeStatus.configured ? '保存新 Key' : '保存并启用'}</button></div></label>{pinmeStatus.configured ? <button type="button" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-danger disabled:opacity-50" disabled={removingPinme} onClick={() => void removePinmeAppKey()}>{removingPinme ? <LoaderCircle className="animate-spin" size={14} /> : <Trash2 size={14} />}移除 PinMe 配置</button> : null}</div><div className="mt-4 grid gap-3 md:grid-cols-3">{[['自动打包', '生成可在线查看的 index.html 与可下载 Markdown'], ['不可变版本', '保存 CID、Manifest hash 与父版本关系'], ['安全边界', 'Key 不进入前端包、日志、交付文件或 API 响应']].map(([title, detail]) => <div className="rounded-xl border border-line p-4" key={title}><p className="text-sm font-semibold">{title}</p><p className="mt-2 text-xs leading-5 text-muted">{detail}</p></div>)}</div></> : null}

          {!loading && section === 'security' ? <><div className="border-b border-line pb-4"><h2 className="font-semibold">安全</h2><p className="mt-1 text-xs text-muted">账户身份与平台权限在服务端交叉校验。</p></div><div className="mt-5 space-y-3">{[['访问令牌', '每次私有 API 请求均由 Worker 验证'], ['Web3 身份', '钱包关联来自已签名的 Privy Identity Token'], ['Agent Endpoint 密钥', '只允许 Worker Secret，不写入 D1 或前端包'], ['PinMe AppKey', '按用户使用 AES-GCM 加密保存；接口只返回配置状态和脱敏账户']].map(([title, detail]) => <div className="flex gap-3 rounded-xl border border-line p-4" key={title}><ShieldCheck className="mt-0.5 shrink-0 text-cyan" size={17} /><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted">{detail}</p></div></div>)}</div></> : null}

          {!loading && section === 'privacy' ? <><div className="border-b border-line pb-4"><h2 className="font-semibold">数据与隐私</h2><p className="mt-1 text-xs text-muted">业务数据与公开目录具有明确的数据边界。</p></div><div className="mt-5 grid gap-4 md:grid-cols-2"><article className="rounded-2xl border border-cyan/20 bg-cyan/[0.04] p-4"><Database size={19} className="text-cyan" /><p className="mt-4 text-sm font-semibold">账户工作区</p><p className="mt-2 text-xs leading-5 text-muted">任务、Agent、证据、账本和偏好写入当前账户隔离的 D1 数据域。</p></article><article className="rounded-2xl border border-line bg-canvas p-4"><Globe2 size={19} className="text-muted" /><p className="mt-4 text-sm font-semibold">公开目录</p><p className="mt-2 text-xs leading-5 text-muted">未登录访问仅可读取已上线 Agent 的公开资料，不开放业务写入。</p></article></div></> : null}

          {!loading && section === 'locale' ? <><div className="border-b border-line pb-4"><h2 className="font-semibold">语言与地区</h2><p className="mt-1 text-xs text-muted">用于时间、数字和后续邮件模板的本地化显示。</p></div><div className="mt-5 grid gap-5 md:grid-cols-2"><label><span className="field-label">界面语言</span><select className="field" aria-label="界面语言" value={preferences.locale} onChange={(event) => updatePreference('locale', event.target.value as UserPreferences['locale'])}><option value="zh-CN">简体中文</option><option value="en-US">English (US)</option></select></label><label><span className="field-label">时区</span><select className="field" aria-label="时区" value={preferences.timeZone} onChange={(event) => updatePreference('timeZone', event.target.value)}><option value="Asia/Shanghai">Asia/Shanghai · UTC+8</option><option value="Asia/Singapore">Asia/Singapore · UTC+8</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option><option value="America/Los_Angeles">America/Los_Angeles</option></select></label></div><div className="mt-5 flex items-start gap-3 rounded-xl border border-line bg-canvas p-4"><Mail className="mt-0.5 shrink-0 text-cyan" size={17} /><p className="text-xs leading-5 text-muted">邮件与账本时间会按此时区展示；底层审计时间仍以 ISO-8601 UTC 保存。</p></div>{saveBar}</> : null}
        </section>
      </div>
    </div>
  );
}
