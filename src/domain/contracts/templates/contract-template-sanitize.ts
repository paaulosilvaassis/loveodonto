/**
 * @module domain/contracts/templates/contract-template-sanitize
 * @description Sanitização HTML conservadora (allowlist) — Phase 10.4.
 * Sem dependência externa; não permite JavaScript nem CSS arbitrário.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u',
  'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'span', 'div', 'hr',
]);

const VOID_TAGS = new Set(['br', 'hr']);

const ALLOWED_ATTRS = new Set(['colspan', 'rowspan', 'class', 'data-variable']);

const BLOCKED_CLASS_PATTERN = /[^a-zA-Z0-9_\-\s]/;

export interface SanitizeContractHtmlResult {
  html: string;
  removedTags: string[];
  removedAttrs: string[];
  blocked: boolean;
}

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSafeAttrValue(name: string, value: string): boolean {
  const v = String(value || '');
  const lower = v.toLowerCase().trim();
  if (lower.includes('javascript:')) return false;
  if (lower.includes('data:text/html')) return false;
  if (lower.includes('vbscript:')) return false;
  if (name.startsWith('on')) return false;
  if (name === 'href' || name === 'src' || name === 'style' || name === 'srcdoc') return false;
  if (name === 'class' && BLOCKED_CLASS_PATTERN.test(v)) return false;
  if ((name === 'colspan' || name === 'rowspan') && !/^\d{1,2}$/.test(v)) return false;
  if (name === 'data-variable' && !/^[a-zA-Z0-9_.:\-]+$/.test(v)) return false;
  return true;
}

/**
 * Parser HTML minimalista via regex + stack — adequado a conteúdo de template controlado.
 * Não usa DOMParser do browser (funciona em Node/tests).
 */
export function sanitizeContractTemplateHtml(input: string): SanitizeContractHtmlResult {
  const removedTags: string[] = [];
  const removedAttrs: string[] = [];
  let blocked = false;
  const source = String(input ?? '');

  if (!source.trim()) {
    return { html: '', removedTags, removedAttrs, blocked: false };
  }

  // Remover comentários e CDATA
  let html = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');

  const tokenRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  const out: string[] = [];
  const openStack: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(html)) !== null) {
    if (match[3] != null) {
      out.push(escapeHtml(match[3]));
      continue;
    }

    const full = match[0];
    const tagName = String(match[1] || '').toLowerCase();
    const attrChunk = String(match[2] || '');
    const isClosing = full.startsWith('</');
    const isSelfClosing = /\/\s*>$/.test(full) || VOID_TAGS.has(tagName);

    if (!ALLOWED_TAGS.has(tagName)) {
      removedTags.push(tagName);
      blocked = blocked || ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta', 'style'].includes(tagName);
      continue;
    }

    if (isClosing) {
      if (openStack[openStack.length - 1] === tagName) {
        openStack.pop();
        out.push(`</${tagName}>`);
      }
      continue;
    }

    const safeAttrs: string[] = [];
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRe.exec(attrChunk)) !== null) {
      const name = String(attrMatch[1] || '').toLowerCase();
      const value = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? '';
      if (name.startsWith('on')) {
        removedAttrs.push(name);
        blocked = true;
        continue;
      }
      if (!ALLOWED_ATTRS.has(name) || !isSafeAttrValue(name, value)) {
        removedAttrs.push(name);
        if (name === 'style' || name === 'href' || name === 'src') blocked = true;
        continue;
      }
      safeAttrs.push(`${name}="${escapeHtml(value)}"`);
    }

    const attrStr = safeAttrs.length ? ` ${safeAttrs.join(' ')}` : '';
    if (isSelfClosing) {
      out.push(`<${tagName}${attrStr} />`);
    } else {
      openStack.push(tagName);
      out.push(`<${tagName}${attrStr}>`);
    }
  }

  while (openStack.length) {
    out.push(`</${openStack.pop()}>`);
  }

  return {
    html: out.join(''),
    removedTags: [...new Set(removedTags)],
    removedAttrs: [...new Set(removedAttrs)],
    blocked,
  };
}
