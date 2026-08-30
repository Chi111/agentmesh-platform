import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../shared/markdown';

describe('shared Markdown renderer', () => {
  it('renders GFM content consistently for delivery surfaces', () => {
    const html = renderMarkdown([
      '# 报告', '',
      '| 项目 | 结果 |', '| --- | --- |', '| 交付 | 完成 |', '',
      '- [x] 已核验', '', '> 客户可直接阅读', '',
      '```json', '{"ready":true}', '```',
    ].join('\n'));

    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<pre><code class="language-json">');
  });

  it('escapes raw HTML and rejects executable links', () => {
    const html = renderMarkdown([
      '<img src=x onerror=alert(1)>', '',
      '[官网](https://pinme.dev)', '',
      '[相对文件](./deliverable.md)', '',
      '[危险链接](javascript:alert(1))',
    ].join('\n'));

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('href="https://pinme.dev" target="_blank" rel="noreferrer noopener"');
    expect(html).toContain('href="./deliverable.md"');
    expect(html).not.toContain('href="javascript:');
  });
});
