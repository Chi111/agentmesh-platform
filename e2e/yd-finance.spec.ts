import { expect, test, type Page } from '@playwright/test';
import { BRAND } from '../shared/brand';

const profile = {
  id: 'USER-e2e-requester',
  email: 'requester@example.test',
  displayName: 'E2E Requester',
  role: 'requester',
};

const overview = {
  config: {
    configured: false,
    chainId: 11155111,
    tokenAddress: null,
    distributorAddress: null,
    stakingAddress: null,
    decimals: 18,
    confirmations: 3,
    testnet: true,
    rewardLabel: `测试 ${BRAND.contribution.symbol} 奖励`,
    yieldLabel: 'Earn Vault 未启用',
  },
  epochs: [{
    id: 'EPOCH-e2e', epochNumber: 1, status: 'published', startsAt: '2026-08-01T00:00:00.000Z',
    endsAt: '2026-08-15T00:00:00.000Z', claimEndsAt: '2099-09-15T00:00:00.000Z', totalRewardUnits: '10000000000000000000000',
    accountScoreCap: 1_000_000, formulaVersion: 'v1', rules: {}, chainId: 11155111,
    distributorAddress: '0x2000000000000000000000000000000000000002', merkleRoot: `0x${'11'.repeat(32)}`,
    manifestHash: `0x${'22'.repeat(32)}`, publishTxHash: `0x${'33'.repeat(32)}`, computedAt: '2026-08-16T00:00:00.000Z',
    publishedAt: '2026-08-16T01:00:00.000Z', createdBy: profile.id, createdAt: '2026-08-16T00:00:00.000Z', updatedAt: '2026-08-16T01:00:00.000Z',
  }],
  allocations: [{
    id: 'ALLOC-e2e', epochId: 'EPOCH-e2e', userId: profile.id, walletAddress: '0x1000000000000000000000000000000000000001',
    effectiveScore: 12_500, amountUnits: '125000000000000000000', leafHash: `0x${'44'.repeat(32)}`, proof: [], status: 'unclaimed',
    claimTxHash: null, claimedAt: null, createdAt: '2026-08-16T00:00:00.000Z',
  }],
  activities: [{
    id: 'ACT-e2e', sourceKey: 'mission:TASK-YD-E2E:requester', userId: profile.id, missionId: 'TASK-YD-E2E', disputeId: null,
    role: 'requester', asset: 'mUSDC', settledAmount: 100, qualityBps: 10_000, penaltyBps: 0, scoreMicros: 10_000,
    eligible: true, detail: {}, occurredAt: '2026-08-15T00:00:00.000Z', createdAt: '2026-08-15T00:00:00.000Z',
  }],
  staking: {
    userId: profile.id, walletAddress: '0x1000000000000000000000000000000000000001', amountUnits: '50000000000000000000',
    unlockTime: '2027-08-23T00:00:00.000Z', durationSeconds: 31_536_000, reputationBps: 11_000, rawPower: '12500000000',
    delegatedTo: '0x1000000000000000000000000000000000000001', votingPower: '12500000000', verified: true,
    lastTxHash: `0x${'55'.repeat(32)}`, lastBlockNumber: '9000000', lastLogIndex: 1, updatedAt: '2026-08-23T00:00:00.000Z',
  },
  governance: [{
    proposal: {
      id: 'PROPOSAL-e2e', proposalNumber: 1, proposerId: 'USER-admin', proposalType: 'development', title: '资助 Agent Runtime 安全审计',
      description: '使用生态基金完成独立安全审计。', payload: {}, status: 'active', snapshotBlock: '8999999',
      startsAt: '2026-08-23T00:00:00.000Z', endsAt: '2099-08-30T00:00:00.000Z', quorumBps: 2000, approvalBps: 5001,
      eligiblePower: '20000000000', forPower: '0', againstPower: '0', abstainPower: '0', finalizedAt: null, finalizedBy: null,
      createdAt: '2026-08-23T00:00:00.000Z',
    },
    electorate: [], votes: [], currentUser: { eligible: true, canVote: true, hasVoted: false, power: '12500000000', choice: null },
  }],
};

function envelope(data: unknown) {
  return { data, meta: { requestId: 'REQ-yd-e2e' } };
}

async function mockWorkspace(page: Page) {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/agents') return route.fulfill({ json: envelope([]) });
    if (path === '/api/bootstrap') return route.fulfill({ json: envelope({ profile, missions: [], agents: [], notifications: [], developer: null }) });
    if (path === '/api/disputes') return route.fulfill({ json: envelope([]) });
    if (path === '/api/yd/overview') return route.fulfill({ json: envelope(overview) });
    return route.fulfill({ status: 404, json: { error: { code: 'UNMOCKED', message: `${route.request().method()} ${path}` } } });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.sessionStorage.setItem('agentmesh:e2e-auth', 'true'));
  await mockWorkspace(page);
});

test(`${BRAND.contribution.name} keeps rewards, Power and task settlement visibly separated`, async ({ page }) => {
  await page.goto('/#/yd-finance');

  await expect(page.getByRole('heading', { name: BRAND.contribution.displayName, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: BRAND.contribution.navigationLabel, exact: true })).toBeVisible();
  await expect(page.getByText(`${BRAND.contribution.symbol} 是 ${BRAND.platform.name} 的${BRAND.contribution.purposeLabel}，不是任务支付资产`)).toBeVisible();
  await expect(page.getByText(`125 ${BRAND.contribution.symbol}`)).toBeVisible();
  await expect(page.getByText('12,500,000,000')).toBeVisible();
  await expect(page.getByRole('heading', { name: '周期奖励' })).toBeVisible();
  await expect(page.getByRole('heading', { name: `锁仓与 ${BRAND.contribution.powerName}` })).toBeVisible();
  await expect(page.getByRole('heading', { name: '生态治理' })).toBeVisible();
  await expect(page.getByText('任务争议仍由仲裁委员会一人一票')).toBeVisible();
  await expect(page.getByText(`${BRAND.contribution.symbol} 测试网合约尚未完整配置`)).toBeVisible();
  await expect(page.getByText(/真实收益或 APY/)).toBeVisible();
  await expect(page.getByText(/测试奖励率|真实 APY/)).toHaveCount(0);
});

test(`${BRAND.contribution.name} has no horizontal overflow on mobile`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/yd-finance');
  await expect(page.getByRole('heading', { name: BRAND.contribution.displayName, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByRole('heading', { name: '周期奖励' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '生态治理' })).toBeVisible();
});
