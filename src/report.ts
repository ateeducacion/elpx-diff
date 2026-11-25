import type { ElpxDiff } from './diff.js';
import { type Lang, strings } from './i18n.js';
import { renderHtml } from './render.js';

import css from './web/styles.css' with { type: 'text' };

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A self-contained HTML page with the comparison: no scripts, nothing fetched; to archive, print or send. */
export function renderReport(diff: ElpxDiff, lang: Lang = 'en', options: { split?: boolean } = {}): string {
  const t = strings(lang);
  const [before, after] = [diff.before.name || diff.before.title, diff.after.name || diff.after.title];
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${before} → ${after}`)} · elpx-diff</title>
<style>${css}</style>
</head>
<body>
<main>
<h1>${t.report}</h1>
<p class="compare"><span>${esc(before)}</span> → <span>${esc(after)}</span></p>
${renderHtml(diff, lang, options)}
</main>
</body>
</html>
`;
}
