import { ArrowRight, AtSign, Globe2, LoaderCircle, LogIn, MailCheck, ShieldCheck, UserPlus, WalletCards } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { useAuth } from './AuthProvider';
import { privyGoogleEnabled } from './config';

export function AuthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { loginWithEmail, loginWithGoogle, loginWithPrivy, register, status, provider, error: sessionError } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'register') {
        await register(email.trim(), password, displayName.trim());
        setMessage('验证邮件已发送。完成邮箱验证后即可登录真实工作区。');
        setMode('login');
      } else {
        await loginWithEmail(email.trim(), password);
        onClose();
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : '认证失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = async () => {
    setBusy(true);
    setError('');
    try {
      await loginWithGoogle();
      onClose();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Google 登录失败。');
    } finally {
      setBusy(false);
    }
  };

  const unifiedLogin = async () => {
    setBusy(true);
    setError('');
    try {
      await loginWithPrivy();
      onClose();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : '统一登录入口暂时不可用。');
    } finally {
      setBusy(false);
    }
  };

  if (provider === 'privy') {
    return (
      <Modal open={open} onClose={onClose} title="进入 AgentMesh" description={`一个账户同时覆盖 Web2 与 Web3。邮箱${privyGoogleEnabled ? '、Google' : ''}和钱包身份最终进入同一个真实工作区。`}>
        <div className="overflow-hidden rounded-2xl border border-line bg-canvas">
          <div className="border-b border-line bg-ink px-5 py-5 text-white">
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan"><ShieldCheck size={14} />Verified session</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[9px] text-white/50">WEB2 + WEB3</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">登录方式只是入口，任务归属和操作权限仍由 AgentMesh Worker 校验，不把钱包地址当作权限凭据。</p>
          </div>
          <div className={`grid gap-px bg-line ${privyGoogleEnabled ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {[
              { icon: AtSign, label: '邮箱验证码', detail: '无需记密码' },
              ...(privyGoogleEnabled ? [{ icon: Globe2, label: 'Google', detail: '快速进入' }] : []),
              { icon: WalletCards, label: '钱包签名', detail: 'SIWE 身份' },
            ].map(({ icon: Icon, label, detail }) => (
              <div className="bg-white p-4" key={label}>
                <span className="flex size-9 items-center justify-center rounded-xl border border-cyan/20 bg-cyan/[0.08] text-cyan"><Icon size={17} /></span>
                <p className="mt-3 text-xs font-semibold text-ink">{label}</p>
                <p className="mt-1 text-[11px] text-muted">{detail}</p>
              </div>
            ))}
          </div>
        </div>
        {(error || sessionError) ? <p className="mt-4 rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error || sessionError}</p> : null}
        <button type="button" className="btn-primary mt-5 w-full" onClick={() => void unifiedLogin()} disabled={busy || status === 'loading'}>
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          选择登录方式
          <ArrowRight size={15} />
        </button>
        <p className="mt-4 text-center text-[11px] leading-5 text-muted">无钱包用户登录后会获得嵌入式钱包；已有钱包用户可直接签名登录或稍后关联。</p>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === 'login' ? '连接正式工作区' : '创建 AgentMesh 账户'} description="登录后任务、Agent、通知和结算状态将写入 PinMe Worker + D1；未登录仅可浏览公开 Agent 目录。">
      <div className="mb-5 grid grid-cols-2 rounded-xl border border-line bg-canvas p-1">
        <button type="button" className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'login' ? 'bg-white shadow-sm' : 'text-muted'}`} onClick={() => setMode('login')}><LogIn size={15} className="mr-2 inline" />登录</button>
        <button type="button" className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'register' ? 'bg-white shadow-sm' : 'text-muted'}`} onClick={() => setMode('register')}><UserPlus size={15} className="mr-2 inline" />注册</button>
      </div>
      <form className="space-y-4" onSubmit={submit}>
        {mode === 'register' ? <label><span className="field-label">显示名称</span><input className="field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required /></label> : null}
        <label><span className="field-label">邮箱</span><input className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
        <label><span className="field-label">密码</span><input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={12} required /><span className="mt-2 block text-[11px] text-muted">至少 12 位；凭据由 Identity Platform 处理，不进入 AgentMesh 数据库。</span></label>
        {message ? <p className="flex gap-2 rounded-xl border border-lime/40 bg-lime/10 p-3 text-sm"><MailCheck size={17} className="mt-0.5 shrink-0" />{message}</p> : null}
        {error ? <p className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
        <button type="submit" className="btn-primary w-full" disabled={busy || status === 'loading'}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}{mode === 'login' ? '登录真实工作区' : '创建并发送验证邮件'}<ArrowRight size={15} /></button>
      </form>
      <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-muted"><span className="h-px flex-1 bg-line" />或<span className="h-px flex-1 bg-line" /></div>
      <button type="button" className="btn-secondary w-full" onClick={googleLogin} disabled={busy}><Globe2 size={16} />使用 Google 登录</button>
    </Modal>
  );
}
