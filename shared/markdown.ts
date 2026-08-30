import { Marked, type Tokens } from 'marked';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(value: string): string | null {
  const href = value.trim();
  if (!href || /[\u0000-\u001f\u007f]/.test(href)) return null;
  if (href.startsWith('#')) return href;
  if (/^(https?:|mailto:|ipfs:)/i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.includes('\\')) return null;
  return href;
}

const markdown = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }: Tokens.Link) {
      const label = this.parser.parseInline(tokens);
      const safe = safeHref(href);
      if (!safe) return label;
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
      const externalAttributes = /^(?:https?:|ipfs:)/i.test(safe)
        ? ' target="_blank" rel="noreferrer noopener"'
        : '';
      return `<a href="${escapeHtml(safe)}"${titleAttribute}${externalAttributes}>${label}</a>`;
    },
    image({ href, title, text }: Tokens.Image) {
      const safe = safeHref(href);
      if (!safe || !/^https?:/i.test(safe)) return escapeHtml(text);
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text)}"${titleAttribute} loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
    },
  },
});

/**
 * Render user/Agent supplied Markdown with GFM support. Raw HTML is always
 * escaped, unsafe URL schemes are removed, and remote images do not send a
 * referrer. The returned HTML is safe for the delivery surfaces in this repo.
 */
export function renderMarkdown(source: string): string {
  return markdown.parse(source, { async: false });
}
