const platform = {
  name: 'pinme-mesh',
  legacyNames: ['AgentMesh'],
  tagline: 'Orchestration Network',
  pageTitle: 'AI Agent 调度平台',
  description: 'AI Agent 任务拆解、智能组队、执行监控与可信结算平台',
} as const;

const contribution = {
  name: 'pinme-mesh Contribution',
  shortName: 'PM',
  symbol: 'PM',
  powerName: 'Power',
  navigationLabel: '贡献与治理',
  purposeLabel: '贡献与治理凭证',
  purposeCode: 'contribution_and_governance',
} as const;

const evidence = {
  providerName: 'PinMe',
  protocolName: 'IPFS',
} as const;

/**
 * Public product terminology shared by the frontend and Worker.
 *
 * Change platform, contribution-asset, or evidence-provider naming here. UI
 * labels and public API metadata should derive from this object instead of
 * repeating brand strings in feature modules.
 */
export const BRAND = Object.freeze({
  platform: Object.freeze({
    ...platform,
    defaultUserName: `${platform.name} User`,
    defaultUserNames: Object.freeze([
      `${platform.name} User`,
      ...platform.legacyNames.map((name) => `${name} User`),
    ]),
    documentTitle: `${platform.name} · ${platform.pageTitle}`,
    metaDescription: `${platform.name} — ${platform.description}`,
  }),
  contribution: Object.freeze({
    ...contribution,
    displayName: `${contribution.name}（${contribution.symbol}）`,
    testName: `${platform.name} Test ${contribution.shortName}`,
    testSymbol: contribution.symbol,
    eyebrow: `${contribution.shortName} Rewards & Governance`,
    centerLabel: `${contribution.shortName} 贡献与治理中心`,
    disclaimer: `${contribution.shortName} 是 ${platform.name} 的贡献与治理品牌，不代表 ${evidence.providerName} 官方发行或背书的代币。`,
  }),
  evidence: Object.freeze({
    ...evidence,
    label: `${evidence.providerName} / ${evidence.protocolName}`,
    compactLabel: `${evidence.providerName}/${evidence.protocolName}`,
    badgeLabel: `${evidence.providerName.toUpperCase()} / ${evidence.protocolName} EVIDENCE`,
  }),
});

export function isDefaultPlatformUserName(value: string | null | undefined) {
  return Boolean(value && BRAND.platform.defaultUserNames.some((name) => name === value));
}

export function normalizePlatformUserName(value: string | null | undefined) {
  return isDefaultPlatformUserName(value) ? BRAND.platform.defaultUserName : value || BRAND.platform.defaultUserName;
}
