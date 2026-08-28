import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BRAND } from '../../constants/brand';

interface ErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${BRAND.platform.name} render failure`, error, info.componentStack);
  }

  private goToDashboard = () => {
    window.location.hash = '/dashboard';
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="mesh-grid flex min-h-screen items-center justify-center bg-ink px-5 py-12 text-white">
        <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-float backdrop-blur md:p-8" role="alert">
          <span className="flex size-11 items-center justify-center rounded-xl bg-danger/15 text-danger"><AlertTriangle size={21} /></span>
          <p className="eyebrow mt-6 !text-cyan">Recovery Mode</p>
          <h1 className="mt-2 text-2xl font-semibold">页面遇到异常，但你的数据没有被修改</h1>
          <p className="mt-3 text-sm leading-6 text-white/55">可以重新加载当前页面，或返回工作台恢复操作。如果问题持续出现，请把发生时间提供给平台管理员。</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" className="btn-signal" onClick={() => window.location.reload()}><RefreshCw size={16} />重新加载</button>
            <button type="button" className="btn-secondary !border-white/15 !bg-white/5 !text-white" onClick={this.goToDashboard}><Home size={16} />返回工作台</button>
          </div>
        </section>
      </main>
    );
  }
}
