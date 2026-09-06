import { expect, test } from '@playwright/test';

for (const timezoneId of ['Asia/Shanghai', 'America/New_York']) test.describe(timezoneId, () => {
  test.use({ timezoneId });

for (const width of [1280, 390]) test(`mission creation submits a zoned deadline and rejects past input at ${width}px`, async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-05T00:00:00Z'));
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => window.sessionStorage.setItem('agentmesh:e2e-auth', 'true'));
  const profile = { id: 'requester', role: 'requester', displayName: '任务方', email: 'requester@example.test' };
  const submissions: Record<string, unknown>[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/missions' && route.request().method() === 'POST') {
      submissions.push(route.request().postDataJSON());
      return route.fulfill({ status: 400, json: { error: { message: '测试服务暂时不可用，请重试' } } });
    }
    return route.fulfill({ json: { data: path === '/api/bootstrap' ? { profile, missions: [], agents: [], notifications: [] } : [] } });
  });
  await page.goto('/#/agents');
  await page.evaluate(async profile => {
    const [{ setApiTokenProvider }, { useAppStore }] = await Promise.all([import('/src/services/api.ts'), import('/src/store/useAppStore.ts')]);
    setApiTokenProvider(async () => 'test-planning-token');
    useAppStore.setState({ profile, role: 'requester', missions: [], agents: [] });
    window.location.hash = '#/missions/new';
  }, profile);
  await page.getByLabel('目标标题').fill('生成一份可验证的市场研究报告');
  await page.getByLabel('结果描述').fill('请研究目标市场的竞争情况，整理可核验的数据来源，并输出包含风险和行动建议的完整报告。');
  const deadline = page.getByLabel('截止时间');
  await deadline.fill('2020-01-01T12:00');
  await page.getByRole('button', { name: 'AI 分析并生成方案' }).click();
  await expect(page.getByRole('alert')).toContainText('晚于当前时间');
  expect(submissions).toHaveLength(0);
  if (timezoneId === 'America/New_York') {
    await deadline.fill('2027-03-14T02:30');
    await page.getByRole('button', { name: 'AI 分析并生成方案' }).click();
    await expect(page.getByRole('alert')).toContainText('因时区切换不存在');
    expect(submissions).toHaveLength(0);
  }
  await deadline.fill('2027-09-05T18:30');
  const expected = timezoneId === 'Asia/Shanghai' ? '2027-09-05T10:30:00.000Z' : '2027-09-05T22:30:00.000Z';
  await page.getByRole('button', { name: 'AI 分析并生成方案' }).click();
  await expect(page.getByRole('alert')).toContainText('测试服务暂时不可用');
  expect(submissions).toHaveLength(1);
  expect(submissions[0].deadline).toBe(expected);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

});
