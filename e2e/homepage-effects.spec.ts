import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('agentmesh:public-locale', 'zh-CN'));
  await page.route('**/ethereum-sepolia-rpc.publicnode.com/**', (route) => route.abort());
  await page.route('**/11155111.rpc.thirdweb.com/**', (route) => route.abort());
});

test('Pretext title and subtitle stay readable and loop with reduced-motion fallback', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/');
  const canvases = [page.locator('.contract-pretext-title'), page.locator('.contract-pretext-subtitle')];
  for (const canvas of canvases) {
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    await expect(canvas).toHaveAttribute('data-phase', 'flow');
    expect(Number(await canvas.getAttribute('data-glyphs'))).toBeGreaterThan(8);
    const pixels = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
    await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(pixels);
  }
  for (const canvas of canvases) {
    await expect.poll(async () => Number(await canvas.getAttribute('data-cycle')), { timeout: 12_000 }).toBeGreaterThanOrEqual(1);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const canvas of canvases) {
    await expect(canvas).toHaveAttribute('data-phase', 'static');
    await expect(canvas).toBeHidden();
  }
  await expect(page.locator('[data-pretext-active]')).toHaveCount(0);
  await expect(page.getByText('资金有路径。', { exact: true })).toBeVisible();
  await expect(page.locator('.contract-hero__description-source [data-pretext-source]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('homepage surfaces respond to a pointer and the task demo loops without input', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/');
  const button = page.locator('header [data-magnetic]');
  await button.hover({ position: { x: 15, y: 15 } });
  await expect(button).toHaveAttribute('data-pointer-active', 'true');
  await expect.poll(() => button.evaluate((element) => element.style.getPropertyValue('--surface-x'))).not.toBe('0px');
  await page.mouse.move(0, 0);
  await expect(button).not.toHaveAttribute('data-pointer-active');
  expect(await button.evaluate((element) => element.style.getPropertyValue('--surface-x'))).toBe('');

  const demo = page.locator('.task-flow-demo');
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute('data-running', 'true');
  await expect(demo.locator('.task-flow-demo__node')).toHaveCount(6);
  // Observe the actual CSS animation crossing a cycle boundary without any pointer input.
  await expect.poll(async () => demo.locator('.task-flow-demo__node').first().evaluate((element) => {
    const animation = element.getAnimations()[0];
    return Number(animation?.effect?.getComputedTiming().currentIteration ?? 0);
  }), { timeout: 12_000 }).toBeGreaterThanOrEqual(1);
  await demo.getByRole('button', { name: '暂停演示' }).click();
  await expect(demo.locator('.task-flow-demo__node').first()).toHaveCSS('animation-play-state', 'paused');
  await demo.getByRole('button', { name: '播放演示' }).click();
  await expect(demo.locator('.task-flow-demo__node').first()).toHaveCSS('animation-play-state', 'running');
  await demo.screenshot({ path: testInfo.outputPath('task-flow-desktop.png') });

  const card = page.locator('[data-holographic]').first();
  await card.scrollIntoViewIfNeeded();
  await card.hover({ position: { x: 30, y: 30 } });
  await expect(card).toHaveAttribute('data-pointer-active', 'true');
  expect(await card.evaluate((element) => element.style.getPropertyValue('--tilt-x'))).not.toBe('0deg');
  await page.mouse.move(0, 0);
  await expect(card).not.toHaveAttribute('data-pointer-active');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(demo).toHaveAttribute('data-running', 'false');
});

test('mobile task diagram fits the viewport and reduced motion stays static', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/');
  const demo = page.locator('.task-flow-demo');
  await demo.scrollIntoViewIfNeeded();
  await expect(demo.locator('.task-flow-demo__wires--mobile')).toBeVisible();
  await expect(demo).toHaveAttribute('data-running', 'true');
  await expect(demo.locator('.task-flow-demo__node').first()).toHaveCSS('animation-play-state', 'running');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(demo.locator('.task-flow-demo__node').first()).toHaveCSS('animation-name', 'none');
  await expect(demo.getByRole('button')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await demo.screenshot({ path: testInfo.outputPath('task-flow-mobile.png') });
  const card = page.locator('[data-holographic]').first();
  await card.hover();
  await expect(card).not.toHaveAttribute('data-pointer-active');
  await expect(card).toHaveCSS('transform', 'none');
  await page.getByLabel('选择语言').selectOption('en');
  await expect(demo.getByRole('heading', { name: 'One task. A coordinated team.' })).toBeAttached();
});
