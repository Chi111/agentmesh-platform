import { Bot, CheckCheck, FileCheck2, Pause, Play, ScanSearch, Send, Waypoints } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PublicLocale } from '../../locales/contractShowcase';

const labels = {
  'zh-CN': { title: '一个任务，多方协作。', caption: '流程演示 · 从需求到交付', task: '发布任务', agents: ['调研 Agent', '构建 Agent', '校验 Agent'], review: '汇总验收', delivery: '交付成果', pause: '暂停演示', play: '播放演示', description: '任务并行分配给调研、构建和校验 Agent，汇总验收后交付成果。' },
  en: { title: 'One task. A coordinated team.', caption: 'ILLUSTRATED FLOW · REQUEST TO DELIVERY', task: 'Request', agents: ['Research', 'Build', 'Validate'], review: 'Review', delivery: 'Delivery', pause: 'Pause demo', play: 'Play demo', description: 'A task is distributed to research, build and validation agents, then reviewed and delivered.' },
  'ja-JP': { title: 'ひとつのタスク、チームで実現。', caption: 'フロー例 · 依頼から納品まで', task: 'タスク依頼', agents: ['調査 Agent', '構築 Agent', '検証 Agent'], review: '成果を確認', delivery: '成果を納品', pause: 'デモを一時停止', play: 'デモを再生', description: '調査・構築・検証 Agent にタスクを並列配分し、成果を確認して納品します。' },
} as const;

const desktopPaths = ['M 80 180 C 180 180 190 80 300 80', 'M 80 180 H 300', 'M 80 180 C 180 180 190 280 300 280', 'M 300 80 C 420 80 420 180 530 180', 'M 300 180 H 530', 'M 300 280 C 420 280 420 180 530 180', 'M 530 180 H 720'];
const mobilePaths = ['M 180 45 C 180 110 60 100 60 165', 'M 180 45 V 165', 'M 180 45 C 180 110 300 100 300 165', 'M 60 165 C 60 240 180 230 180 285', 'M 180 165 V 285', 'M 300 165 C 300 240 180 230 180 285', 'M 180 285 V 390'];

export function TaskFlowDemo({ locale }: { locale: PublicLocale }) {
  const copy = labels[locale];
  const ref = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = false;
    const update = () => { element.dataset.running = String(visible && !document.hidden); };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const nodes = [
    { label: copy.task, code: 'REQUEST', icon: Send, position: 'request', step: 0 },
    ...copy.agents.map((label, index) => ({ label, code: `AGENT 0${index + 1}`, icon: [ScanSearch, Bot, CheckCheck][index], position: `agent-${index}`, step: 1 })),
    { label: copy.review, code: 'REVIEW', icon: Waypoints, position: 'review', step: 2 },
    { label: copy.delivery, code: 'DELIVERED', icon: FileCheck2, position: 'delivery', step: 3 },
  ];
  return <figure ref={ref} className="task-flow-demo" data-paused={paused}>
    <figcaption className="task-flow-demo__caption">
      <div><p>{copy.caption}</p><h3>{copy.title}</h3></div>
      <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? copy.play : copy.pause} aria-pressed={paused}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>
    </figcaption>
    <p className="sr-only">{copy.description}</p>
    <div className="task-flow-demo__graph" aria-hidden="true">
      {([['desktop', desktopPaths, '0 0 800 360'], ['mobile', mobilePaths, '0 0 360 450']] as const).map(([variant, paths, viewBox]) => <svg className={`task-flow-demo__wires task-flow-demo__wires--${variant}`} viewBox={viewBox} preserveAspectRatio="none" key={variant}>
        {paths.map((d, index) => <g key={d} style={{ '--step': index < 3 ? 0 : index < 6 ? 1 : 2 } as CSSProperties}><path d={d} /><path className="task-flow-demo__pulse" d={d} pathLength="1" /></g>)}
      </svg>)}
      {nodes.map(({ label, code, icon: Icon, position, step }) => <div className={`task-flow-demo__node task-flow-demo__node--${position}`} style={{ '--step': step } as CSSProperties} key={code}>
        <Icon size={21} /><small>{code}</small><strong>{label}</strong><i />
      </div>)}
    </div>
  </figure>;
}
