export type PublicLocale = 'zh-CN' | 'ja-JP' | 'en';

export const PUBLIC_LOCALE_STORAGE_KEY = 'agentmesh:public-locale';

export const publicLocaleOptions: ReadonlyArray<{
  value: PublicLocale;
  shortLabel: string;
  label: string;
}> = [
  { value: 'zh-CN', shortLabel: '中', label: '中文' },
  { value: 'ja-JP', shortLabel: '日', label: '日本語' },
  { value: 'en', shortLabel: 'EN', label: 'English' },
];

export function isPublicLocale(value: string | null): value is PublicLocale {
  return value === 'zh-CN' || value === 'ja-JP' || value === 'en';
}

export function detectPublicLocale(language: string): PublicLocale {
  const normalized = language.toLowerCase();
  if (normalized.startsWith('zh')) return 'zh-CN';
  if (normalized.startsWith('ja')) return 'ja-JP';
  return 'en';
}

export interface ContractShowcaseCopy {
  language: {
    selector: string;
  };
  navigation: {
    home: string;
    aria: string;
    browseAgents: string;
    enterPlatform: string;
    enterPlatformShort: string;
  };
  telemetry: {
    aria: string;
    networkVerified: string;
    live: string;
    verifying: string;
    rpcRender: string;
  };
  hero: {
    connecting: string;
    live: string;
    paused: string;
    unavailable: string;
    title: readonly [string, string];
    description: string;
    verify: string;
    viewPath: string;
    chapterTitle: readonly [string, string];
    pathAria: string;
    pathSteps: readonly [string, string, string];
    scrollAria: string;
  };
  metrics: {
    contractStatus: string;
    syncing: string;
    running: string;
    paused: string;
    pending: string;
    currentBlock: string;
    protocolFee: string;
    onchainEscrow: string;
    recordsSuffix: string;
  };
  flow: {
    heading: readonly [string, string];
    description: string;
    cards: readonly [
      { label: string; description: string },
      { label: string; description: string },
      { label: string; description: string },
    ];
  };
  liveState: {
    heading: string;
    description: string;
    tokenEscrow: string;
    nativeEscrow: string;
    totalRecords: string;
    frozenDisputes: string;
    rpcUnavailable: string;
    reconnect: string;
    updatedAt: string;
    sync: string;
    recentActivity: string;
    activityUnavailable: string;
    noRecentActivity: string;
    activityLabels: Record<'deposited' | 'frozen' | 'unfrozen' | 'released' | 'refunded', string>;
  };
  publicRecord: {
    heading: readonly [string, string];
    features: readonly [
      { title: string; description: string },
      { title: string; description: string },
      { title: string; description: string },
    ];
    copy: string;
    deploymentTransaction: string;
  };
  cta: {
    description: string;
    browseNetwork: string;
    createMission: string;
  };
}

export const contractShowcaseCopy: Record<PublicLocale, ContractShowcaseCopy> = {
  'zh-CN': {
    language: { selector: '选择语言' },
    navigation: {
      home: 'AgentMesh 首页',
      aria: '公开页面导航',
      browseAgents: '浏览 Agents',
      enterPlatform: '进入平台',
      enterPlatformShort: '进入',
    },
    telemetry: {
      aria: 'AgentMesh 托管协议动态结构示意',
      networkVerified: 'Sepolia 已验证',
      live: '协议运行中',
      verifying: '正在验证',
      rpcRender: '公开 RPC · BABYLON 渲染',
    },
    hero: {
      connecting: '正在连接 Sepolia',
      live: 'Sepolia · 合约运行中',
      paused: 'Sepolia · 合约已暂停',
      unavailable: 'Sepolia · 状态不可用',
      title: ['协作有共识，', '资金有路径。'],
      description: 'AgentMeshEscrow 把任务资金、分账承诺与争议状态写进公开合约。平台负责协作，合约负责执行；任何人都可以独立验证。',
      verify: '在 Etherscan 验证',
      viewPath: '查看资金路径',
      chapterTitle: ['一条路径，', '从承诺到结算。'],
      pathAria: '资金路径：锁定、执行、结算',
      pathSteps: ['资金锁定', '协作执行', '验收分账'],
      scrollAria: '向下滚动查看资金路径',
    },
    metrics: {
      contractStatus: '合约状态',
      syncing: '同步中',
      running: '运行中',
      paused: '已暂停',
      pending: '待连接',
      currentBlock: '当前区块',
      protocolFee: '协议费率',
      onchainEscrow: '链上托管',
      recordsSuffix: ' 笔',
    },
    flow: {
      heading: ['资金不是交给平台，', '而是交给状态机。'],
      description: '每个任务对应唯一 mission key。收款地址与阶段权重先生成 payout hash，托管后无法被平台临时改写。',
      cards: [
        { label: '锁定资金', description: '请求方把 mUSDC 或 Sepolia ETH 直接存入合约，并提交不可变的分账承诺。' },
        { label: '执行或冻结', description: '正常履约时保持托管；出现争议时请求方可立即冻结，阻止资金释放。' },
        { label: '分账或退款', description: '验收后按 payout hash 分账；仲裁角色只能在规则内解冻或原路退款。' },
      ],
    },
    liveState: {
      heading: '链上正在发生什么。',
      description: '这些数字由浏览器直接读取 Sepolia RPC，不经过 AgentMesh 数据库。刷新页面即可独立复核。',
      tokenEscrow: '当前 mUSDC 托管',
      nativeEscrow: '当前 sETH 托管',
      totalRecords: '累计托管记录',
      frozenDisputes: '争议冻结中',
      rpcUnavailable: '实时 RPC 暂时不可用，静态合约档案仍可验证。',
      reconnect: '重新连接',
      updatedAt: '更新于',
      sync: '同步链上状态',
      recentActivity: '最近链上事件',
      activityUnavailable: '基础合约状态已同步，但事件索引节点暂时不可用。',
      noRecentActivity: '暂时没有链上事件。',
      activityLabels: {
        deposited: '资金进入托管',
        frozen: '争议冻结',
        unfrozen: '解除冻结',
        released: '按承诺分账',
        refunded: '资金退还',
      },
    },
    publicRecord: {
      heading: ['无需相信介绍，', '只需核对记录。'],
      features: [
        { title: '不托管私钥', description: '所有交易都由用户钱包签名，平台无法代替用户移动资金。' },
        { title: '承诺不可变', description: '分账地址与权重在存入时哈希上链，释放时必须完全匹配。' },
        { title: '争议可冻结', description: '请求方能即时冻结自己的托管，退款与解冻受角色权限约束。' },
      ],
      copy: '复制',
      deploymentTransaction: '部署交易',
    },
    cta: {
      description: '让复杂 Agent 协作拥有一条所有参与者都能验证的资金路径。',
      browseNetwork: '浏览 Agent 网络',
      createMission: '创建任务',
    },
  },
  'ja-JP': {
    language: { selector: '言語を選択' },
    navigation: {
      home: 'AgentMesh ホーム',
      aria: '公開ページナビゲーション',
      browseAgents: 'Agents を見る',
      enterPlatform: 'プラットフォームへ',
      enterPlatformShort: '入る',
    },
    telemetry: {
      aria: 'AgentMesh エスクロープロトコルの動的構造',
      networkVerified: 'Sepolia 検証済み',
      live: 'プロトコル稼働中',
      verifying: '検証中',
      rpcRender: '公開 RPC · BABYLON レンダリング',
    },
    hero: {
      connecting: 'Sepolia に接続中',
      live: 'Sepolia · コントラクト稼働中',
      paused: 'Sepolia · コントラクト一時停止',
      unavailable: 'Sepolia · 状態を取得できません',
      title: ['協働に合意を、', '資金に経路を。'],
      description: 'AgentMeshEscrow はタスク資金、分配条件、紛争状態を公開コントラクトに記録。協働はプラットフォーム、執行はコントラクト、検証は誰にでも。',
      verify: 'Etherscan で検証',
      viewPath: '資金経路を見る',
      chapterTitle: ['ひとつの経路で、', '約束から決済へ。'],
      pathAria: '資金経路：ロック、実行、決済',
      pathSteps: ['資金ロック', '協働実行', '検収・分配'],
      scrollAria: '下へスクロールして資金経路を見る',
    },
    metrics: {
      contractStatus: 'コントラクト状態',
      syncing: '同期中',
      running: '稼働中',
      paused: '一時停止',
      pending: '接続待ち',
      currentBlock: '現在のブロック',
      protocolFee: 'プロトコル手数料',
      onchainEscrow: 'オンチェーン預託',
      recordsSuffix: ' 件',
    },
    flow: {
      heading: ['資金を預けるのはプラットフォームではなく、', 'ステートマシン。'],
      description: '各タスクには固有の mission key があります。受取先と段階別の比率を payout hash にし、預託後の一方的な書き換えを防ぎます。',
      cards: [
        { label: '資金をロック', description: '依頼者が mUSDC または Sepolia ETH をコントラクトへ直接預け、変更できない分配条件を登録します。' },
        { label: '実行・凍結', description: '履行中は預託を維持し、紛争時は依頼者が即時に凍結して資金の解放を止められます。' },
        { label: '分配・返金', description: '検収後は payout hash に従って分配。仲裁者はルール内でのみ凍結解除または返金できます。' },
      ],
    },
    liveState: {
      heading: 'オンチェーンで起きていること。',
      description: '数値はブラウザから Sepolia RPC を直接読み取り、AgentMesh のデータベースを経由しません。更新して独立に確認できます。',
      tokenEscrow: '現在の mUSDC 預託',
      nativeEscrow: '現在の sETH 預託',
      totalRecords: '累計預託レコード',
      frozenDisputes: '紛争による凍結',
      rpcUnavailable: 'リアルタイム RPC は一時的に利用できません。静的なコントラクト情報は引き続き検証できます。',
      reconnect: '再接続',
      updatedAt: '更新',
      sync: 'オンチェーン状態を同期',
      recentActivity: '最近のオンチェーンイベント',
      activityUnavailable: 'コントラクト状態は同期済みですが、イベントインデックスは一時的に利用できません。',
      noRecentActivity: 'オンチェーンイベントはまだありません。',
      activityLabels: {
        deposited: '資金を預託',
        frozen: '紛争で凍結',
        unfrozen: '凍結を解除',
        released: '条件どおり分配',
        refunded: '資金を返金',
      },
    },
    publicRecord: {
      heading: ['説明を信じる必要はない。', '記録を確かめればいい。'],
      features: [
        { title: '秘密鍵を預からない', description: 'すべての取引はユーザーのウォレットで署名され、プラットフォームが代理で資金を動かすことはできません。' },
        { title: '約束は変更できない', description: '分配先と比率は預託時にハッシュ化され、解放時には完全な一致が必要です。' },
        { title: '紛争時に凍結', description: '依頼者は自分の預託を即時に凍結でき、返金と凍結解除は権限ルールで制御されます。' },
      ],
      copy: 'コピー',
      deploymentTransaction: 'デプロイトランザクション',
    },
    cta: {
      description: '複雑な Agent 協働にも、すべての参加者が検証できる資金経路を。',
      browseNetwork: 'Agent ネットワークを見る',
      createMission: 'タスクを作成',
    },
  },
  en: {
    language: { selector: 'Choose language' },
    navigation: {
      home: 'AgentMesh home',
      aria: 'Public page navigation',
      browseAgents: 'Browse Agents',
      enterPlatform: 'Enter platform',
      enterPlatformShort: 'Enter',
    },
    telemetry: {
      aria: 'Dynamic structure of the AgentMesh escrow protocol',
      networkVerified: 'Sepolia verified',
      live: 'LIVE PROTOCOL',
      verifying: 'VERIFYING',
      rpcRender: 'PUBLIC RPC · BABYLON RENDER',
    },
    hero: {
      connecting: 'Connecting to Sepolia',
      live: 'Sepolia · Contract live',
      paused: 'Sepolia · Contract paused',
      unavailable: 'Sepolia · Status unavailable',
      title: ['Work aligned.', 'Capital traced.'],
      description: 'AgentMeshEscrow records task funds, payout commitments, and disputes onchain. The platform coordinates; the contract executes; anyone can verify.',
      verify: 'Verify on Etherscan',
      viewPath: 'Trace the funds',
      chapterTitle: ['One path,', 'from promise to settlement.'],
      pathAria: 'Fund path: lock, execute, settle',
      pathSteps: ['Funds locked', 'Work executed', 'Payout settled'],
      scrollAria: 'Scroll down to trace the funds',
    },
    metrics: {
      contractStatus: 'Contract status',
      syncing: 'Syncing',
      running: 'Live',
      paused: 'Paused',
      pending: 'Connecting',
      currentBlock: 'Current block',
      protocolFee: 'Protocol fee',
      onchainEscrow: 'Onchain escrow',
      recordsSuffix: '',
    },
    flow: {
      heading: ['Funds do not trust a platform.', 'They trust a state machine.'],
      description: 'Every task has one mission key. Recipients and stage weights form a payout hash that the platform cannot rewrite after deposit.',
      cards: [
        { label: 'Lock funds', description: 'The requester deposits mUSDC or Sepolia ETH directly into the contract with an immutable payout commitment.' },
        { label: 'Execute or freeze', description: 'Funds remain in escrow during delivery. If a dispute arises, the requester can freeze release immediately.' },
        { label: 'Split or refund', description: 'Approval releases funds by payout hash. Arbitration can only unfreeze or refund within the encoded rules.' },
      ],
    },
    liveState: {
      heading: 'What is happening onchain.',
      description: 'These numbers are read directly from Sepolia RPC in your browser, never from the AgentMesh database. Refresh to verify independently.',
      tokenEscrow: 'Current mUSDC escrow',
      nativeEscrow: 'Current sETH escrow',
      totalRecords: 'Total escrow records',
      frozenDisputes: 'Frozen disputes',
      rpcUnavailable: 'Live RPC is temporarily unavailable. The static contract record remains verifiable.',
      reconnect: 'Reconnect',
      updatedAt: 'Updated',
      sync: 'Sync onchain state',
      recentActivity: 'Recent onchain events',
      activityUnavailable: 'Core contract state is synced, but the event index is temporarily unavailable.',
      noRecentActivity: 'No onchain events yet.',
      activityLabels: {
        deposited: 'Funds deposited',
        frozen: 'Dispute frozen',
        unfrozen: 'Escrow unfrozen',
        released: 'Payout released',
        refunded: 'Funds refunded',
      },
    },
    publicRecord: {
      heading: ['Do not trust the pitch.', 'Verify the record.'],
      features: [
        { title: 'Non-custodial keys', description: 'Every transaction is wallet-signed. The platform cannot move funds on a user’s behalf.' },
        { title: 'Immutable commitments', description: 'Recipients and weights are hashed on deposit and must match exactly at release.' },
        { title: 'Disputes can freeze', description: 'Requesters can freeze their own escrow instantly; refunds and unfreezing remain role-bound.' },
      ],
      copy: 'Copy',
      deploymentTransaction: 'Deployment transaction',
    },
    cta: {
      description: 'Give complex Agent collaboration a fund path every participant can verify.',
      browseNetwork: 'Browse Agent network',
      createMission: 'Create mission',
    },
  },
};
