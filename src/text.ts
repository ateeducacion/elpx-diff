import { decodeHTML } from 'entities';

/**
 * Turns iDevice content into the plain lines that are compared: one line per
 * block element, media and links as visible markers, markup dropped. Project
 * HTML is only ever read as text, never rendered.
 * ponytail: regex tokenizer, not an HTML parser; switch to parse5 if odd markup gives wrong lines.
 */

const BLOCK =
  /^(?:p|div|li|ul|ol|h[1-6]|tr|td|th|table|caption|br|hr|section|article|figure|figcaption|blockquote|pre|dt|dd|dl|header|footer|form|fieldset|option|label|summary|details)$/;
const MEDIA = /^(?:video|audio|source|iframe|embed|object|track)$/;
const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;

const attr = (attrs: string, name: string): string => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
};

/** `{{context_path}}/content/resources/foto.jpg` -> `foto.jpg`; external URLs are kept whole. */
const shortUrl = (url: string): string =>
  url.replace(/^\{\{context_path\}\}\//, '').replace(/^content\/resources\//, '');

export function htmlToLines(html: string): string[] {
  const links: string[] = [];
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(TAG, (_all, close: string, rawName: string, attrs: string) => {
      const name = rawName.toLowerCase();
      if (name === 'a') {
        if (!close) {
          links.push(attr(attrs, 'href'));
          return '';
        }
        const href = links.pop() ?? '';
        return href && !href.startsWith('#') ? ` ‹${shortUrl(href)}› ` : '';
      }
      if (close) return BLOCK.test(name) ? '\n' : '';
      if (name === 'img') {
        const alt = attr(attrs, 'alt');
        return ` [img: ${shortUrl(attr(attrs, 'src'))}${alt ? ` — ${alt}` : ''}] `;
      }
      if (MEDIA.test(name)) {
        const src = attr(attrs, 'src') || attr(attrs, 'data');
        return src
          ? `\n[${name === 'source' || name === 'embed' || name === 'object' ? 'media' : name}: ${shortUrl(src)}]\n`
          : '';
      }
      return BLOCK.test(name) ? '\n' : '';
    });
  return decodeHTML(text)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Decodes a game's obfuscated DataGame payload: legacy unescape(), then XOR 146 (upstream helpers.decrypt). */
export function decryptDataGame(payload: string): string {
  const s = payload.replace(/%u([0-9a-fA-F]{4})|%([0-9a-fA-F]{2})/g, (_m, u: string, x: string) =>
    String.fromCharCode(Number.parseInt(u ?? x, 16)),
  );
  let out = '';
  for (let i = 0; i < s.length; i++) out += String.fromCharCode(146 ^ s.charCodeAt(i));
  return out;
}

/**
 * Text of every string in an iDevice's JSON, in document order.
 * ponytail: heuristic (skips ids, the games' interface messages and strings without letters), no per-iDevice schema.
 */
export function jsonToLines(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (/\p{L}/u.test(value)) out.push(...htmlToLines(value));
  } else if (Array.isArray(value)) {
    for (const item of value) jsonToLines(item, out);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) if (!/^(?:msgs|.*[iI][dD])$/.test(key)) jsonToLines(item, out);
  }
  return out;
}

const DATAGAME = /<div[^>]*class\s*=\s*["'][^"']*-DataGame[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;

/** Lines of one iDevice: its HTML (with game data decoded), or its JSON properties when it has no HTML. */
export function ideviceLines(htmlView: string, jsonProperties: string): string[] {
  const lines: string[] = [];
  const html = htmlView.replace(DATAGAME, (_all, body: string) => {
    const payload = decodeHTML(body.trim());
    try {
      jsonToLines(JSON.parse(payload.startsWith('{') ? payload : decryptDataGame(payload)), lines);
    } catch {
      // Unreadable game data: nothing to show for it.
    }
    return '';
  });
  lines.unshift(...htmlToLines(html));
  if (lines.length === 0 && jsonProperties.trim()) {
    try {
      jsonToLines(JSON.parse(jsonProperties), lines);
    } catch {
      lines.push(...htmlToLines(jsonProperties));
    }
  }
  return lines;
}
