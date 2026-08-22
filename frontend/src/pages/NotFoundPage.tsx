import { ArrowLeft, SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return <div className="panel flex min-h-[60vh] flex-col items-center justify-center p-8 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-canvas text-muted"><SearchX size={24} /></span><p className="eyebrow mt-6">404 / Route not found</p><h1 className="mt-2 text-2xl font-semibold">这个页面不存在</h1><p className="mt-3 max-w-md text-sm leading-6 text-muted">路由没有对应的前端模块。请返回工作台继续使用。</p><Link className="btn-primary mt-6" to="/dashboard"><ArrowLeft size={16} />返回工作台</Link></div>;
}
