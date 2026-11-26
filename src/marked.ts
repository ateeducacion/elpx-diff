import { type Zippable, zipSync } from 'fflate';

import { diffProjects, type ElpxDiff, type IdeviceDiff, type LineDiff, type PageDiff, pageTally } from './diff.js';
import { type Lang, strings } from './i18n.js';
import { ideviceName } from './idevices.js';
import { loadProject } from './model.js';
import { hunks, lineHtml, pairs } from './render.js';
import { htmlToLines } from './text.js';
import { ElpxError, readZip, type ZipEntry } from './zip.js';

/** The page that lists every page with changes, at the root of the copy next to index.html. */
export const SUMMARY_PAGE = 'elpx-diff.html';

/** Which version of the project a marked page belongs to. */
export type Side = 'new' | 'old';

/**
 * What a page shown in the viewer posts to the app when one of its links leads to another page: its path in the
 * package or, for a page only the other version has (listed in the menu), its place in the comparison's pages.
 */
export interface OpenMessage {
  type: 'elpx-diff-open';
  path?: string;
  page?: number;
}
/**
 * How the viewer shows a page: the old version or the new one as they are,
 * or the changes marked (on the new version; on the old one for a page the
 * new version removed).
 */
export type Mode = 'old' | 'both' | 'new';
/** What a page posts when the bar's switch asks for another mode, with the iDevice in sight, to land on it. */
export interface ModeMessage {
  type: 'elpx-diff-mode';
  mode: Mode;
  anchor?: string;
}

// Every file of the new version is inflated to build the copy; this bounds a zip bomb.
const MAX_TOTAL = 1024 * 1024 * 1024;
/** Already compressed: stored as they are instead of deflated again. */
const STORED = /\.(?:png|jpe?g|gif|webp|avif|mp4|m4v|webm|ogg|ogv|mp3|m4a|wav|pdf|zip|elpx|woff2?)$/i;
/** The pages of an eXeLearning web export. */
const PAGE = /^(?:index\.html|html\/[^/]+\.html)$/;

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const short = (s: string, n = 120): string => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Two versions of the same line as one, the way a reader compares them: the
 * words both share as they are, the removed ones struck through and the added
 * ones highlighted, each where it goes.
 */
function merged(a: LineDiff, b: LineDiff): string {
  const [old, now] = [a.words!, b.words!];
  let out = '';
  let [i, j] = [0, 0];
  while (i < old.length || j < now.length) {
    if (i < old.length && old[i]!.changed) out += `<del>${esc(old[i++]!.text)}</del>`;
    else if (j < now.length && now[j]!.changed) out += `<ins>${esc(now[j++]!.text)}</ins>`;
    else {
      out += esc(now[j]!.text); // shared by both versions
      i++;
      j++;
    }
  }
  return `<li class="mix"><span class="sign" aria-hidden="true">~</span><span class="txt">${out}</span></li>`;
}

/** Scoped to the attributes and classes added here, so the project's theme keeps the rest of the page. */
const CSS = `<style id="elpx-diff-marks">
html:not(.elpx-diff-off) [data-elpx-diff]{padding-left:.75rem!important}
html:not(.elpx-diff-off) [data-elpx-diff=added]{background:#e6ffec!important;box-shadow:-6px 0 0 #1a7f37!important;color:#1b1f24!important}
html:not(.elpx-diff-off) [data-elpx-diff=modified]{box-shadow:-6px 0 0 #bf8700!important}
html:not(.elpx-diff-off) [data-elpx-diff-p=added]{background:#d1f7dc!important;box-shadow:-4px 0 0 #1a7f37!important;color:#1b1f24!important}
html:not(.elpx-diff-off) [data-elpx-diff-p=edited]{background:#fff3c4!important;box-shadow:-4px 0 0 #bf8700!important;color:#1b1f24!important}
html:not(.elpx-diff-off) nav a[data-elpx-diff-nav=added]{background:#e6ffec!important;color:#116329!important}
html:not(.elpx-diff-off) nav a[data-elpx-diff-nav=removed]{background:#ffebe9!important;color:#a40e26!important;text-decoration:line-through!important}
html:not(.elpx-diff-off) nav a[data-elpx-diff-nav]::after{content:" ~";color:#7d4e00;font-weight:700}
html:not(.elpx-diff-off) nav a[data-elpx-diff-nav=added]::after{content:" +";color:inherit}
html:not(.elpx-diff-off) nav a[data-elpx-diff-nav=removed]::after{content:" −";color:inherit;display:inline-block;text-decoration:none}
nav li[data-elpx-diff-nav-extra] a{display:block}
.elpx-diff-off nav li[data-elpx-diff-nav-extra]{display:none!important}
.elpx-diff-in-app .elpx-diff-float{display:none!important}
html:not(.elpx-diff-off) [data-elpx-diff=removed]{background:#ffebe9!important;box-shadow:-6px 0 0 #a40e26!important;color:#1b1f24!important}
html:not(.elpx-diff-off) [data-elpx-diff-p=removed]{background:#ffd7d5!important;box-shadow:-4px 0 0 #a40e26!important;color:#1b1f24!important}
.elpx-diff-off .elpx-diff-key,.elpx-diff-off .elpx-diff-tag,.elpx-diff-off .elpx-diff-changes,.elpx-diff-off .elpx-diff-box{display:none!important}
.elpx-diff-tag{display:inline-block;margin:.75rem 0 .25rem;padding:.05rem .45rem;border-radius:3px;background:#1a7f37;color:#fff;font:600 .75rem/1.4 system-ui,sans-serif}
.elpx-diff-changes{margin:.75rem 0 .35rem;border:1px solid #bf8700;border-radius:4px;background:#fff;color:#1b1f24;font:.9375rem/1.5 system-ui,sans-serif;overflow:hidden}
.elpx-diff-changes summary{padding:.2rem .6rem;background:#bf8700;color:#1b1f24;font-weight:600;font-size:.8125rem;cursor:pointer}
.elpx-diff-changes ol{margin:0;padding:0;list-style:none}
.elpx-diff-changes li{display:flex;margin:0;overflow-wrap:anywhere}
.elpx-diff-changes .sign{flex:none;width:1.75rem;padding:.3rem 0;text-align:center;font-weight:700;user-select:none}
.elpx-diff-changes .txt{flex:1;min-width:0;padding:.3rem .6rem}
.elpx-diff-changes ins,.elpx-diff-changes del{text-decoration:none}
.elpx-diff-changes li.ins{background:#e6ffec}.elpx-diff-changes li.ins .sign{color:#116329}
.elpx-diff-changes li.del{background:#ffebe9}.elpx-diff-changes li.del .sign{color:#a40e26}
.elpx-diff-changes mark{padding:1px 2px;color:inherit}
.elpx-diff-changes li.ins mark{background:#abf2bc}
.elpx-diff-changes li.del mark{background:#ffc1ba;text-decoration:line-through}
.elpx-diff-changes li.mix .sign{color:#7d4e00}
.elpx-diff-changes li.mix del{background:#ffc1ba;color:#82071e;text-decoration:line-through}
.elpx-diff-changes li.mix ins{background:#abf2bc;color:#0a3d1a}
.elpx-diff-changes li.ctx{color:#57606a}
.elpx-diff-changes li.skip{justify-content:center;padding:.15rem .6rem;background:#f3f4f6;color:#57606a;font-size:.8125rem}
.elpx-diff-changes .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.elpx-diff-note{margin:0;padding:.4rem .6rem;color:#57606a;font-size:.875rem}
.elpx-diff-box{margin:1rem 0 1.5rem;padding:.75rem 1rem;border:1px solid #8c959f;border-left:6px solid #3f4c8a;border-radius:4px;background:#f6f8fa;color:#1b1f24;font:.9375rem/1.5 system-ui,sans-serif}
.elpx-diff-box p{margin:.25rem 0}
.elpx-diff-box ul{margin:.25rem 0;padding-left:1.25rem}
.elpx-diff-box a{color:#2f3a75}
.elpx-diff-box del{color:#a40e26;text-decoration:none}
.elpx-diff-key{display:inline-block;margin-right:.75rem;font-size:.8125rem}
.elpx-diff-key::before{content:"";display:inline-block;width:.9rem;height:.9rem;margin-right:.3rem;vertical-align:-.1rem}
.elpx-diff-key.added::before{background:#e6ffec;box-shadow:-3px 0 0 #1a7f37}
.elpx-diff-key.modified::before{background:#fff3c4;box-shadow:-3px 0 0 #bf8700}
.elpx-diff-float{position:fixed;right:.75rem;bottom:.75rem;z-index:2147483000;display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .75rem;max-width:min(40rem,calc(100vw - 1.5rem));padding:.45rem .75rem;border:1px solid #8c959f;border-left:6px solid #3f4c8a;border-radius:6px;background:#fff;color:#1b1f24;font:.8125rem/1.4 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25)}
.elpx-diff-float .elpx-diff-key{margin:0}
.elpx-diff-tag.removed{background:#a40e26}
.elpx-diff-key.removed::before{background:#ffebe9;box-shadow:-3px 0 0 #a40e26}
.elpx-diff-box ins{color:#116329;text-decoration:none}
.elpx-diff-switch{display:inline-flex}
.elpx-diff-float .elpx-diff-switch button{border-radius:0}
.elpx-diff-float .elpx-diff-switch button:first-child{border-radius:4px 0 0 4px}
.elpx-diff-float .elpx-diff-switch button:last-child{border-radius:0 4px 4px 0;border-left:0}
.elpx-diff-float .elpx-diff-switch button[aria-pressed=true]{background:#1b1f24;color:#fff;cursor:default}
.elpx-diff-float .elpx-diff-switch button:disabled{opacity:.45;cursor:not-allowed}
.elpx-diff-float button{margin:0;padding:.25rem .6rem;border:1px solid #1b1f24;border-radius:4px;background:#fff;color:#1b1f24;font:inherit;cursor:pointer}
.elpx-diff-float a{color:#2f3a75}
@media (max-width:40rem){.elpx-diff-float{left:.5rem;right:.5rem;bottom:.5rem;max-width:none;gap:.25rem .6rem}}
</style>`;

/**
 * First script of a page shown in the viewer, where it runs with an origin of
 * its own and no network: a stand-in for the storage and cookies the browser
 * refuses there (eXeLearning's scripts use them), and its links to other pages
 * of the package sent to the app instead of followed.
 */
const viewScript = (path: string, anchor = '', clean = false): string => `<script>(function () {${
  clean ? "\n  document.documentElement.classList.add('elpx-diff-off');" : ''
}
  var PATH = ${JSON.stringify(path).replace(/</g, '\\u003c')};
  var ANCHOR = ${JSON.stringify(anchor).replace(/</g, '\\u003c')};
  function memory() {
    var d = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
      setItem: function (k, v) { d[k] = String(v); },
      removeItem: function (k) { delete d[k]; },
      clear: function () { d = {}; },
      key: function (i) { return Object.keys(d)[i] || null; },
      get length() { return Object.keys(d).length; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try { window[name].length; } catch (e) {
      try { Object.defineProperty(window, name, { value: memory(), configurable: true }); } catch (e2) {}
    }
  });
  try { document.cookie; } catch (e) {
    try { Object.defineProperty(document, 'cookie', { get: function () { return ''; }, set: function () {}, configurable: true }); } catch (e2) {}
  }
  // In the app the versions are switched from its own header, above the page: the bar is not shown.
  document.documentElement.classList.add('elpx-diff-in-app');
  // Another way of seeing the page, asked for by the app: it lands on the iDevice now in sight.
  addEventListener('message', function (event) {
    if (event.source === parent && event.data && event.data.type === 'elpx-diff-switch') ask(event.data.mode);
  });
  function ask(mode) {
    // The iDevice in sight, then those before it, then those after: the other version lands on the first it has.
    var nodes = [].slice.call(document.querySelectorAll('.idevice_node[id]'));
    var seen = 0;
    while (seen < nodes.length - 1 && nodes[seen].getBoundingClientRect().bottom <= 80) seen++;
    var order = nodes.slice(0, seen + 1).reverse().concat(nodes.slice(seen + 1));
    // At the top of the page, the other one opens at its top too.
    var anchor = scrollY < 50 ? '' : order.slice(0, 40).map(function (node) { return node.id; }).join(' ');
    parent.postMessage({ type: 'elpx-diff-mode', mode: mode, anchor: anchor }, '*');
  }
  // Written in place of viewer.html, the page gets no load event: it waits until it is parsed, then lands, and
  // again a moment later, once the theme's scripts have laid it out.
  var target = null;
  function find() {
    var ids = ANCHOR.split(' ');
    for (var i = 0; i < ids.length && !target; i++) target = document.getElementById(ids[i]);
    return target;
  }
  function land() {
    // Straight there: a theme's smooth scrolling would be cut short by the second landing.
    if (target) scrollTo({ top: target.getBoundingClientRect().top + scrollY - 100, behavior: 'instant' });
  }
  var tries = 0;
  (function wait() {
    if (!ANCHOR) return;
    if (document.readyState !== 'loading') { if (find()) { setTimeout(land, 100); setTimeout(land, 700); } }
    else if (tries++ < 100) setTimeout(wait, 50);
  })();
  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest && event.target.closest('a[href], area[href]');
    if (!link) return;
    // A page only the other version has, listed in the menu: the app opens it in that version.
    var other = link.getAttribute('data-elpx-diff-page');
    if (other !== null) {
      event.preventDefault();
      parent.postMessage({ type: 'elpx-diff-open', page: Number(other) }, '*');
      return;
    }
    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(https?|mailto):/i.test(href)) return;
    event.preventDefault();
    var path;
    try { path = decodeURIComponent(new URL(href, 'http://elpx/' + PATH).pathname.slice(1)); } catch (e) { return; }
    parent.postMessage({ type: 'elpx-diff-open', path: path }, '*');
  }, true);
})();</script>`;

/** A line as both content.xml and the export give it: without link targets or the resources folder. */
const comparable = (s: string): string =>
  s
    .replace(/‹[^›]*›/g, '')
    .replace(/(?:\.\.\/)+/g, '')
    .replace(/content\/resources\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
/** The blocks of text that a line of the comparison stands for. */
const LEAF = /<(p|li|h[1-6]|td|th|figcaption|dt|dd|caption)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;

/**
 * Marks one exported page, of the new version or of the old one: an attribute
 * on each iDevice that changed (the style sheet paints it), right before it a
 * label (added, or removed in the old version) or what changed in it, word by
 * word as in the report (modified), the paragraphs it gained, lost or had
 * edited, a bar in a corner and, when there is something to tell, a box at the
 * top. What is inserted goes next to the iDevices, never inside them, so their
 * own scripts find them as they were; everything inserted is escaped. In the
 * app's viewer (`viewer` given) the bar switches between the two versions;
 * elsewhere it turns the marks off and on.
 */
function markPage(
  html: string,
  page: PageDiff,
  marks: Map<string, IdeviceDiff>,
  up: string,
  lang: Lang,
  side: Side = 'new',
  viewer?: { mode: Mode; old: boolean; new: boolean },
): string {
  const t = strings(lang);
  const gone = side === 'new' ? 'added' : 'removed'; // what only this version has, whole
  const label = (i: IdeviceDiff): string =>
    [
      i.status === 'modified' ? t.modified : t[i.status],
      i.moved ? t.moved.toLowerCase() : '',
      i.formatOnly ? t.formatShort : '',
    ]
      .filter(Boolean)
      .join(' · ');
  const changes = (i: IdeviceDiff): string => {
    if (i.formatOnly) return `<p class="elpx-diff-note">${t.formatOnly}</p>`;
    // Only the changed lines: the iDevice itself, right below, gives the context.
    const lines = hunks(i.lines, 0);
    if (!lines.some((l) => typeof l === 'object')) return `<p class="elpx-diff-note">${t.movedIdevice}</p>`;
    return `<ol>${pairs(lines)
      .map(([a, b]) =>
        typeof a === 'number'
          ? lineHtml(a, lang)
          : a?.words && typeof b === 'object' && b.words
            ? merged(a, b)
            : [a, b].map((l) => (l ? lineHtml(l, lang) : '')).join(''),
      )
      .join('')}</ol>`;
  };
  // Inside each modified iDevice, the paragraphs this version has and the other has not, or has otherwise, marked
  // where they are: each changed line of the comparison is a block of the iDevice, found again by its text.
  const sign = side === 'new' ? '+' : '-';
  let whole = 0;
  let edited = 0;
  const starts = [...html.matchAll(/<div\b[^>]*?\sid\s*=\s*["']([^"']+)["']/gi)].filter(
    (m) => marks.get(m[1]!)?.status === 'modified',
  );
  for (const m of starts.reverse()) {
    const kinds = new Map<string, string>();
    for (const line of marks.get(m[1]!)!.lines)
      if (line.op === sign && comparable(line.text)) kinds.set(comparable(line.text), line.words ? 'edited' : gone);
    const from = m.index + m[0].length;
    const next = html.slice(from).search(/<div\b[^>]*\bidevice_node\b|<\/main\b/i);
    const to = next < 0 ? html.length : from + next;
    const part = html.slice(from, to).replace(LEAF, (all, tag: string, attrs: string, inner: string) => {
      const kind = kinds.get(comparable(htmlToLines(inner).join(' ')));
      if (!kind) return all;
      // Headings are marked but not counted: some iDevices rebuild them with their scripts, and the marks go.
      if (!/^h\d$/i.test(tag)) {
        if (kind === 'edited') edited++;
        else whole++;
      }
      return `<${tag}${attrs} data-elpx-diff-p="${kind}">${all.slice(all.indexOf('>') + 1)}`;
    });
    html = html.slice(0, from) + part + html.slice(to);
  }

  html = html.replace(/<div\b[^>]*?\sid\s*=\s*["']([^"']+)["']/gi, (tag, id: string) => {
    const idevice = marks.get(id);
    if (!idevice) return tag;
    const before =
      idevice.status === 'modified'
        ? `<details class="elpx-diff-changes" lang="${lang}" open><summary>${esc(label(idevice))}</summary>${changes(idevice)}</details>`
        : `<p class="elpx-diff-tag ${idevice.status}" lang="${lang}">${esc(label(idevice))}</p>`;
    return `${before}${tag} data-elpx-diff="${idevice.status}"`;
  });

  const tally = pageTally(page);
  // What the other version has and this one does not, by its text.
  const missing = page.blocks.flatMap((b) =>
    b.idevices.filter((i) => i.status === (side === 'new' ? 'removed' : 'added')),
  );
  const [tagged, here] = side === 'new' ? (['del', t.removedHere] as const) : (['ins', t.addedHere] as const);
  // What does not fit the bar: the page's own news and the text of what the other version has, at the top.
  const notes = [
    page.status === gone ? `<p>${side === 'new' ? t.newPage : t.removedPage}</p>` : '',
    page.oldTitle !== undefined
      ? `<p>${esc(side === 'new' ? t.renamedFrom(page.oldTitle || t.untitled) : t.renamedTo(page.title || t.untitled))}</p>`
      : '',
    page.moved ? `<p>${t.movedPage}</p>` : '',
    missing.length
      ? `<details><summary>${here(missing.length)}</summary><ul>${missing
          .map(
            (i) =>
              `<li>${esc(ideviceName(i.type, lang))}: <${tagged}>${esc(short(i.lines[0]?.text ?? t.empty))}</${tagged}></li>`,
          )
          .join('')}</ul></details>`
      : '',
  ].join('');
  const box = notes
    ? `<aside class="elpx-diff-box" lang="${lang}"><p><strong>${t.markedHere}</strong></p>${notes}</aside>`
    : '';
  // Always in sight, in a corner: what changed on the page, the key, the versions or the marks, and the list.
  const counts =
    tally.added + tally.modified + tally.removed
      ? [
          t.tally(tally),
          whole + edited ? (side === 'new' ? t.paragraphs(whole, edited) : t.paragraphsOld(whole, edited)) : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : page.status === gone
        ? side === 'new'
          ? t.newPage
          : t.removedPage
        : page.status === 'unchanged'
          ? t.noChanges
          : '';
  const toggle = `var off=document.documentElement.classList.toggle('elpx-diff-off');this.textContent=off?${JSON.stringify(t.showMarks)}:${JSON.stringify(t.hideMarks)};this.setAttribute('aria-pressed',String(off))`;
  // Old version, the changes, new version: each as far as the page has it.
  const modes = (v: { mode: Mode; old: boolean; new: boolean }): string =>
    (['old', 'both', 'new'] as const)
      .map((m) => {
        const off = m !== 'both' && !v[m];
        return `<button type="button" data-elpx-diff-mode="${m}" aria-pressed="${m === v.mode}"${off ? ` disabled title="${m === 'new' ? t.notInNew : t.notInOld}"` : ''}>${m === 'new' ? t.newVersion : m === 'old' ? t.oldVersion : t.changesView}</button>`;
      })
      .join('');
  const control = viewer
    ? `<span class="elpx-diff-switch" role="group" aria-label="${t.version}">${modes(viewer)}</span>`
    : `<button type="button" aria-pressed="false" onclick="${esc(toggle)}">${t.hideMarks}</button>`;
  const bar = `<div class="elpx-diff-float" lang="${lang}" role="region" aria-label="${t.markedHere}">${
    counts ? `<strong>${counts}</strong>` : ''
  }<span class="elpx-diff-key ${gone}">${t[gone]}</span><span class="elpx-diff-key modified">${t.modified}</span>${control}<a href="${up}${SUMMARY_PAGE}">${t.allChanges}</a></div>`;
  const end = html.search(/<\/body>/i);
  html = end >= 0 ? html.slice(0, end) + bar + html.slice(end) : html + bar;

  // First thing in the page's content column; a page without the usual layout gets it at the top of <main>.
  const start = /<div\b[^>]*\bid\s*=\s*["']page-content-[^>]*>/i.exec(html) ?? /<main\b[^>]*>/i.exec(html);
  const at = start ? start.index + start[0].length : -1;
  if (at >= 0 && box) html = html.slice(0, at) + box + html.slice(at);
  const head = html.search(/<\/head>/i);
  return head >= 0 ? html.slice(0, head) + CSS + html.slice(head) : CSS + html;
}

/** The first page of the copy: every page with changes, the most changed first, each a link to its marked page. */
function summaryPage(diff: ElpxDiff, found: Map<PageDiff, string>, lang: Lang): string {
  const t = strings(lang);
  const weight = (p: PageDiff): number => {
    const tally = pageTally(p);
    return tally.added + tally.modified + tally.removed;
  };
  const changed = diff.pages
    .filter((p) => p.status !== 'unchanged' && p.status !== 'removed')
    .sort((x, y) => weight(y) - weight(x));
  const unchanged = diff.pages.filter((p) => p.status === 'unchanged').length;
  const removed = diff.pages.filter((p) => p.status === 'removed');
  const cell = (n: number): string => `<td>${n || ''}</td>`;
  const rows = changed
    .map((p) => {
      const tally = pageTally(p);
      const path = found.get(p);
      const title = esc(p.title || t.untitled);
      const notes = [
        p.status === 'added' ? t.added.toLowerCase() : '',
        p.oldTitle !== undefined ? t.renamed.toLowerCase() : '',
        p.moved ? t.moved.toLowerCase() : '',
      ].filter(Boolean);
      return `<tr><th scope="row">${path ? `<a href="${esc(path)}" target="_blank" rel="noopener">${title}</a>` : title}${
        notes.length ? ` <small>(${notes.join(', ')})</small>` : ''
      }</th>${cell(tally.added)}${cell(tally.modified)}${cell(tally.removed)}</tr>`;
    })
    .join('');
  const [before, after] = [diff.before.name || diff.before.title, diff.after.name || diff.after.title];
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.markedTitle} · elpx-diff</title>
<style>
body{margin:0 auto;max-width:56rem;padding:1.5rem 1rem 3rem;font:1rem/1.5 system-ui,sans-serif;color:#1b1f24;background:#fff}
h1{font-size:1.6rem;margin:0 0 .25rem}
.compare{margin:0 0 1rem;font-family:ui-monospace,monospace;color:#57606a;overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;margin-top:1rem}
th,td{padding:.45rem .5rem;border-bottom:1px solid #d8dee4;text-align:left;vertical-align:top}
td{text-align:right;width:5.5rem;font-variant-numeric:tabular-nums}
thead th{font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:#57606a}
thead th:not(:first-child){text-align:right}
td:nth-child(2){color:#116329}td:nth-child(4){color:#a40e26}td:nth-child(3){color:#7d4e00}
small{color:#57606a}a{color:#2f3a75}
@media (max-width:30rem){th,td{padding:.4rem .25rem}td{width:auto}thead th{font-size:.625rem;letter-spacing:0}}
</style>
</head>
<body>
<h1>${t.markedTitle}</h1>
<p class="compare">${esc(before)} → ${esc(after)}</p>
<p>${t.markedIntro}</p>
<p><a href="index.html" target="_blank" rel="noopener">${t.openSite}</a></p>
<h2>${t.changedPages(changed.length)}</h2>
<table><thead><tr><th scope="col">${t.page}</th><th scope="col">${t.addedMany}</th><th scope="col">${t.modifiedMany}</th><th scope="col">${t.removedMany}</th></tr></thead><tbody>${rows}</tbody></table>
${unchanged ? `<p>${t.unchangedPages(unchanged)}</p>` : ''}${
    removed.length
      ? `<h2>${t.removedPages}</h2><ul>${removed.map((p) => `<li><del>${esc(p.title || t.untitled)}</del></li>`).join('')}</ul>`
      : ''
  }
</body>
</html>
`;
}

const toBlob = (x: Blob | Uint8Array): Blob => (x instanceof Blob ? x : new Blob([x as Uint8Array<ArrayBuffer>]));

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};
// A file bigger than this is left out of a page shown in the app (a picture that size is rare in a page).
const MAX_INLINE = 8 * 1024 * 1024;

/** Where the last `tag` before `at` starts in `text` (a tag of that very name), or -1. */
function before(text: string, tag: string, at: number): number {
  let i = at;
  do i = i > 0 ? text.lastIndexOf(tag, i - 1) : -1;
  while (i >= 0 && !/[\s>]/.test(text.charAt(i + tag.length)));
  return i;
}

/** `rel` as a path inside the package, seen from the file at `base`; undefined when it points elsewhere. */
export function resolvePath(base: string, rel: string): string | undefined {
  rel = rel.trim();
  if (!rel || rel.startsWith('#') || rel.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(rel)) return undefined;
  try {
    return decodeURIComponent(new URL(rel, `http://elpx/${base}`).pathname.slice(1));
  } catch {
    return undefined;
  }
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The marked comparison of two versions: the diff, and the exported pages of the new one with the changes marked. */
/**
 * What reads one version's package: its exported pages, found by the ids of
 * the comparison, marked, and made self-contained for the viewer.
 */
function reader(
  entries: Map<string, ZipEntry>,
  byId: Map<string, PageDiff>,
  marks: Map<string, IdeviceDiff>,
  side: Side,
  lang: Lang,
  order: PageDiff[],
) {
  /** What a page only the other version has is, in the comparison. */
  const other = side === 'new' ? 'removed' : 'added';
  const utf8 = new TextDecoder();
  const text = async (path: string): Promise<string> => utf8.decode(await entries.get(path)!.read());
  /** The page each exported file is, known once they are read. */
  const byPath = new Map<string, PageDiff>();
  /**
   * In the page's own menu, each link to a page that changed says how (the style sheet paints it), and the
   * pages only the other version has are listed too, each before the page that follows it in the comparison:
   * removed ones in the new version's menu, added ones in the old version's. Those have nowhere to lead,
   * except in the app (`linked`), which opens them in the version that has them.
   */
  const menu = (html: string, path: string, language: Lang, linked: boolean): string =>
    html.replace(/<nav\b[\s\S]*?<\/nav\s*>/gi, (nav) => {
      const t = strings(language);
      const LINK = /<a\b[^>]*?\shref\s*=\s*(["'])([^"']*)\1/gi;
      const page = (rel: string): PageDiff | undefined => byPath.get(resolvePath(path, rel) ?? '');
      // Where each page's entry starts: the <li> its link is in.
      const starts = new Map<PageDiff, number>();
      for (const link of nav.matchAll(LINK)) {
        const target = page(link[2]!);
        const li = before(nav, '<li', link.index);
        if (target && li >= 0 && !starts.has(target)) starts.set(target, li);
      }
      const end = before(nav, '</ul', nav.length);
      const extra = new Map<number, string>();
      if (starts.size)
        order.forEach((missing, n) => {
          if (missing.status !== other) return;
          const next = order.slice(n + 1).find((p) => starts.has(p));
          const at = next ? starts.get(next)! : end;
          if (at < 0) return;
          const to = linked ? ` href="#" data-elpx-diff-page="${n}"` : '';
          const item = `<li data-elpx-diff-nav-extra><a${to} data-elpx-diff-nav="${other}" title="${esc(other === 'added' ? t.newPage : t.removedPage)}">${esc(missing.title || t.untitled)}</a></li>`;
          extra.set(at, (extra.get(at) ?? '') + item);
        });
      let out = '';
      let from = 0;
      for (const at of [...extra.keys()].sort((x, y) => x - y)) {
        out += mark(nav.slice(from, at)) + extra.get(at)!;
        from = at;
      }
      return out + mark(nav.slice(from));
      function mark(part: string): string {
        return part.replace(LINK, (tag, _q: string, rel: string) => {
          const status = page(rel)?.status ?? 'unchanged';
          return status === 'unchanged' ? tag : `${tag} data-elpx-diff-nav="${status}"`;
        });
      }
    });
  /** Each page's exported file and its HTML, read once. */
  let exported: Promise<Map<PageDiff, { path: string; html: string }>> | undefined;
  const pages = (): Promise<Map<PageDiff, { path: string; html: string }>> =>
    (exported ??= (async () => {
      const found = new Map<PageDiff, { path: string; html: string }>();
      for (const path of [...entries.keys()].filter((name) => PAGE.test(name))) {
        const html = await text(path);
        const id = /<main\b[^>]*?\sid\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];
        const page = id === undefined ? undefined : byId.get(id);
        if (page && !found.has(page)) found.set(page, { path, html });
      }
      for (const [page, file] of found) byPath.set(file.path, page);
      return found;
    })());
  const marked = (
    page: PageDiff,
    path: string,
    html: string,
    language = lang,
    viewer?: { mode: Mode; old: boolean; new: boolean },
  ): string =>
    menu(
      markPage(html, page, marks, path.includes('/') ? '../' : '', language, side, viewer),
      path,
      language,
      !!viewer,
    );

  const inlined = new Map<string, Promise<string | undefined>>();
  /** A file of the package as a data: URL, or undefined when it is missing, too large or not a picture or a font. */
  const dataUrl = (path: string): Promise<string | undefined> => {
    let url = inlined.get(path);
    if (!url) {
      const entry = entries.get(path);
      const type = MIME[path.slice(path.lastIndexOf('.') + 1).toLowerCase()];
      url =
        entry && type && entry.size <= MAX_INLINE
          ? entry.read().then((bytes) => `data:${type};base64,${base64(bytes)}`)
          : Promise.resolve(undefined);
      inlined.set(path, url);
    }
    return url;
  };
  /** CSS with its url()s inlined and its @imports replaced by the sheets they import. */
  const css = async (code: string, base: string, chain: string[] = [base]): Promise<string> => {
    const parts: Promise<string>[] = [];
    const IMPORT = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?[^;]*;/gi;
    code = code.replace(IMPORT, (all, rel: string) => {
      const path = resolvePath(base, rel);
      if (!path || !entries.has(path) || chain.includes(path)) return ''; // missing, or a loop
      parts.push(text(path).then((sheet) => css(sheet, path, [...chain, path])));
      return `/*@${parts.length - 1}@*/`;
    });
    const imported = await Promise.all(parts);
    code = code.replace(/\/\*@(\d+)@\*\//g, (_all, n: string) => imported[Number(n)]!);
    const urls = [...code.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)];
    const values = await Promise.all(
      urls.map((m) => (resolvePath(base, m[2]!) ? dataUrl(resolvePath(base, m[2]!)!) : undefined)),
    );
    let i = 0;
    return code.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (all) => {
      const value = values[i++];
      return value ? `url("${value}")` : all;
    });
  };
  /** A page ready for a frame of its own: its scripts inlined, nothing to fetch. */
  const selfContained = async (html: string, path: string, anchor?: string, clean = false): Promise<string> => {
    const jobs: Promise<string>[] = [];
    const later = (job: Promise<string>): string => `\uE000${jobs.push(job) - 1}\uE001`;
    html = html
      .replace(/<base\b[^>]*>/gi, '')
      .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '')
      // srcset out: its pictures would not be inlined, and the frame cannot fetch them.
      .replace(/<[a-z][^>]*>/gi, (tag) => tag.replace(/\ssrcset\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ''))
      // Links out of the package open in a new tab; the rest stay, and viewScript takes them to the app.
      .replace(/<(a|area)\b([^>]*)>/gi, (all, tag: string, attrs: string) => {
        const href = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
        const url = (href?.[1] ?? href?.[2] ?? href?.[3] ?? '').trim();
        if (!/^(?:https?|mailto):/i.test(url)) return all;
        const rest = attrs.replace(/\s(?:target|rel)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
        return `<${tag}${rest} target="_blank" rel="noopener noreferrer">`;
      })
      // The package's scripts, inlined in their place; those from elsewhere could not load in the frame.
      .replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (all, attrs: string) => {
        const src = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
        if (!src) return all;
        const file = resolvePath(path, src[1] ?? src[2] ?? src[3]!);
        if (!file || !entries.has(file)) return '';
        const rest = attrs.replace(
          /\s(?:src|defer|async|integrity|crossorigin)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi,
          '',
        );
        return later(text(file).then((code) => `<script${rest}>${code.replace(/<\/script/gi, '<\\/script')}</script>`));
      });
    const open = /<head\b[^>]*>/i.exec(html);
    html = open
      ? html.slice(0, open.index + open[0].length) +
        viewScript(path, anchor, clean) +
        html.slice(open.index + open[0].length)
      : viewScript(path, anchor, clean) + html;
    html = html.replace(/<link\b[^>]*>/gi, (tag) => {
      if (!/\srel\s*=\s*["']?stylesheet/i.test(tag)) return '';
      const href = /\shref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
      const sheet = href === undefined ? undefined : resolvePath(path, href);
      if (!sheet || !entries.has(sheet)) return '';
      return later(text(sheet).then(async (code) => `<style>${await css(code, sheet)}</style>`));
    });
    html = html.replace(
      /(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi,
      (_all, open: string, code: string, close: string) => later(css(code, path).then((done) => open + done + close)),
    );
    html = html.replace(
      /(<(?:img|image|input)\b[^>]*?\s(?:src|href|xlink:href)\s*=\s*)(["'])([^"']*)\2/gi,
      (all, head: string, q: string, rel: string) => {
        const file = resolvePath(path, rel);
        return file ? later(dataUrl(file).then((url) => (url ? `${head}${q}${url}${q}` : all))) : all;
      },
    );
    // style="…" or style='…': the inlined url() takes the other kind of quote.
    html = html.replace(/(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi, (all, head: string, dq?: string, sq?: string) => {
      const code = dq ?? sq!;
      if (!/url\(/i.test(code)) return all;
      const [q, other] = dq === undefined ? ["'", '"'] : ['"', "'"];
      return later(css(code, path).then((done) => `${head}${q}${done.replaceAll(q, other)}${q}`));
    });
    const done = await Promise.all(jobs);
    return html.replace(/\uE000(\d+)\uE001/g, (_all, n: string) => done[Number(n)]!);
  };

  return { entries, pages, marked, selfContained };
}

export interface MarkedProject {
  diff: ElpxDiff;
  /**
   * The path inside the package of each page that has an exported page, in
   * the new version or in the old one (none when the website is missing).
   */
  paths(side?: Side): Promise<Map<PageDiff, string>>;
  /**
   * One page, marked and self-contained: its scripts, style sheets, pictures
   * and fonts inlined, nothing left to fetch. Meant for the app's viewer, a
   * frame sandboxed without allow-same-origin and with no network, where the
   * page's scripts run cut off from the app (viewer.html). `mode` is how it
   * is shown (Mode), and its bar switches between the modes; `anchor`,
   * iDevice ids separated by spaces, is where it opens: at the first of them
   * the page has.
   */
  page(page: PageDiff, options?: { lang?: Lang; mode?: Mode; anchor?: string }): Promise<string | undefined>;
  /** The whole website, marked, with elpx-diff.html, as a ZIP. */
  site(): Promise<Uint8Array>;
}

/**
 * Compares two versions and gets their exported websites ready to be marked.
 * Only content.xml is read here; the pages and their files are read when asked
 * for.
 */
export async function markProject(
  before: Blob | Uint8Array,
  after: Blob | Uint8Array,
  options: { lang?: Lang; names?: { before?: string; after?: string } } = {},
): Promise<MarkedProject> {
  const lang = options.lang ?? 'en';
  const [older, newer] = [toBlob(before), toBlob(after)];
  // The comparison may give an item of the new version the id of the old item it matches (alignIds),
  // in place; the exported pages keep the original ids, so a second, untouched reading maps them back.
  const [a, b, original, entries, oldEntries] = await Promise.all([
    loadProject(older),
    loadProject(newer),
    loadProject(newer),
    readZip(newer),
    readZip(older),
  ]);
  const fileName = (x: Blob | Uint8Array): string | undefined =>
    'name' in x && typeof x.name === 'string' ? x.name : undefined;
  const diff = diffProjects(a, b, {
    before: options.names?.before ?? fileName(before),
    after: options.names?.after ?? fileName(after),
  });

  const pageIds = new Map<string, string>();
  const ideviceIds = new Map<string, string>();
  b.pages.forEach((page, i) => {
    const o = original.pages[i]!;
    pageIds.set(page.id, o.id);
    page.blocks.forEach((block, j) =>
      block.idevices.forEach((idevice, k) => ideviceIds.set(idevice.id, o.blocks[j]!.idevices[k]!.id)),
    );
  });
  // Each version's pages and changed iDevices, by the ids its own export uses: the new one's through the maps
  // above; the old one's are those of the comparison, which kept them.
  const byId = new Map<string, PageDiff>();
  const marks = new Map<string, IdeviceDiff>();
  const oldById = new Map<string, PageDiff>();
  const oldMarks = new Map<string, IdeviceDiff>();
  for (const page of diff.pages) {
    if (page.status !== 'removed') byId.set(pageIds.get(page.id)!, page);
    if (page.status !== 'added') oldById.set(page.id, page);
    for (const block of page.blocks)
      for (const idevice of block.idevices) {
        if (idevice.status === 'added' || idevice.status === 'modified')
          marks.set(ideviceIds.get(idevice.id)!, idevice);
        if (idevice.status === 'removed' || idevice.status === 'modified') oldMarks.set(idevice.id, idevice);
      }
  }
  const newSide = reader(entries, byId, marks, 'new', lang, diff.pages);
  const oldSide = reader(oldEntries, oldById, oldMarks, 'old', lang, diff.pages);
  const sides = { new: newSide, old: oldSide };

  return {
    diff,
    paths: async (side = 'new') => new Map([...(await sides[side].pages())].map(([page, file]) => [page, file.path])),
    async page(page, { lang: language = lang, mode = 'both', anchor } = {}) {
      const [inOld, inNew] = await Promise.all([oldSide.pages(), newSide.pages()]);
      const has = { old: inOld.has(page), new: inNew.has(page) };
      // The changes are marked on the new version, or on the old one when the page has only that.
      const side: Side = mode === 'old' ? 'old' : mode === 'new' || has.new ? 'new' : 'old';
      const file = (side === 'old' ? inOld : inNew).get(page);
      return (
        file &&
        sides[side].selfContained(
          sides[side].marked(page, file.path, file.html, language, { mode, ...has }),
          file.path,
          anchor,
          mode !== 'both',
        )
      );
    },
    async site() {
      let total = 0;
      for (const e of entries.values()) total += e.size;
      if (total > MAX_TOTAL) throw new ElpxError('The new version is too large to build the marked copy');
      const { pages, marked } = newSide;
      const found = await pages();
      if (found.size === 0)
        throw new ElpxError('The new version has no exported website inside: save it again with eXeLearning 4');
      const replaced = new Map([...found].map(([page, file]) => [file.path, marked(page, file.path, file.html)]));
      const files: Zippable = {};
      for (const e of entries.values()) {
        const html = replaced.get(e.name);
        files[e.name] = [
          html === undefined ? await e.read() : new TextEncoder().encode(html),
          { level: STORED.test(e.name) ? 0 : 6 },
        ];
      }
      const paths = new Map([...found].map(([page, file]) => [page, file.path]));
      files[SUMMARY_PAGE] = [new TextEncoder().encode(summaryPage(diff, paths, lang)), { level: 6 }];
      return zipSync(files);
    },
  };
}

/**
 * The website exported inside the new version, as a ZIP, with what changed
 * since the old version marked on each page and a summary page
 * (elpx-diff.html) that lists them all, to unzip and open in a browser.
 */
export async function markedSite(
  before: Blob | Uint8Array,
  after: Blob | Uint8Array,
  options: { lang?: Lang; names?: { before?: string; after?: string } } = {},
): Promise<{ zip: Uint8Array; diff: ElpxDiff }> {
  const project = await markProject(before, after, options);
  return { zip: await project.site(), diff: project.diff };
}
