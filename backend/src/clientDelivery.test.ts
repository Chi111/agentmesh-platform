import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildClientDeliveryBundle } from './clientDelivery';

describe('client delivery bundle', () => {
  it('separates the human deliverable from technical evidence and escapes HTML', async () => {
    const bundle = await buildClientDeliveryBundle({
      missionId: 'M-1', missionTitle: '广告文案', stageId: 'S-1', stageName: '交付整合', attemptNo: 1,
      agentId: 'A-1', agentName: 'Writer', logicalName: '最终广告稿', title: '春季发布文案',
      deliverableMarkdown: [
        '## 主文案', '', '> 可直接投放', '',
        '| 渠道 | 预算 |', '| --- | ---: |', '| 搜索 | 20 PM |', '',
        '```ts', 'const ready = true;', '```', '',
        '[查看官网](https://pinme.dev)', '', '[危险链接](javascript:alert(1))', '',
        '<script>alert(1)</script>',
      ].join('\n'),
      acceptanceCriteriaSha256: `sha256:${'a'.repeat(64)}`, versionNo: 1, supersedesRootCid: null,
      createdAt: '2026-08-29T00:00:00.000Z',
    });
    expect(bundle.files.map((file) => file.path)).toEqual(['deliverable.md', 'index.html', 'manifest.json']);
    const html = String(bundle.files.find((file) => file.path === 'index.html')?.content);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('<table>');
    expect(html).toContain('<thead>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain('href="https://pinme.dev" target="_blank" rel="noreferrer noopener"');
    expect(html).not.toContain('href="javascript:');
    expect(bundle.manifest.files).toHaveLength(2);
    expect(bundle.manifest.generator).toBe('agentmesh.pinme-auto-delivery.v1');
  });

  it('builds a navigable multi-stage mission outcome package', async () => {
    const bundle = await buildClientDeliveryBundle({
      missionId: 'M-2', missionTitle: '新产品上市方案', stageId: 'S-final', stageName: '最终复核', attemptNo: 1,
      agentId: 'A-final', agentName: 'Delivery Integrator', logicalName: '完整任务成果包', title: '新产品上市完整成果包',
      deliverableMarkdown: [
        '# 执行结论', '',
        '包含定位、渠道计划和落地节奏。', '',
        '> 建议先完成核心渠道验证，再按周扩展投放。', '',
        '| 阶段 | 负责人 | 验收结果 |',
        '| --- | --- | --- |',
        '| 市场研究 | Evidence Scout | 已完成 |',
        '| 执行规划 | Delivery Integrator | 待甲方确认 |',
      ].join('\n'),
      acceptanceCriteriaSha256: `sha256:${'b'.repeat(64)}`,
      acceptanceCriteria: {
        schema: 'agentmesh.acceptance-criteria.v1', missionId: 'M-2',
        stages: [{ id: 'S-1', name: '市场研究', purpose: '核对目标市场与用户需求', attemptNo: 1 }],
      },
      workstreams: [{
        position: 1, stageId: 'S-1', stageName: '市场研究', purpose: '核对目标市场与用户需求',
        executionMode: 'analyze', agentName: 'Evidence Scout', markdown: '# 市场研究\n\n## 核心发现\n\n- 用户优先关注交付效率',
      }],
      artifactReferences: [{
        name: '渠道排期表', stageName: '执行规划', uri: 'ipfs://bafy-plan',
        contentHash: `sha256:${'c'.repeat(64)}`, mimeType: 'text/csv',
      }],
      versionNo: 1, supersedesRootCid: null, createdAt: '2026-08-29T00:00:00.000Z',
    });

    expect(bundle.files.map((file) => file.path)).toEqual([
      'deliverable.md',
      'acceptance-report.md',
      'artifact-index.md',
      'workstreams/01-市场研究.md',
      'index.html',
      'manifest.json',
    ]);
    expect(bundle.manifest.generator).toBe('agentmesh.pinme-complex-delivery.v2');
    expect(bundle.manifest.files).toHaveLength(5);
    const html = String(bundle.files.find((file) => file.path === 'index.html')?.content);
    expect(html).toContain('分阶段成果与依据');
    expect(html).toContain('真实制品索引');
    expect(html).toContain('市场研究');
    expect(html).toContain('aria-label="成果包目录"');
    expect(html).toContain('href="#stage-1"');

    const qaDirectory = process.env.CLIENT_DELIVERY_QA_DIR;
    if (qaDirectory) {
      await mkdir(qaDirectory, { recursive: true });
      await Promise.all(bundle.files.map(async (file) => {
        const target = join(qaDirectory, file.path);
        await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
        await writeFile(target, file.content);
      }));
    }
  });
});
