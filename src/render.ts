import type { BlockDiff, ElpxDiff, IdeviceDiff, LineDiff, ResourceDiff, Status } from './diff.js';
import { formatSize, type Lang, strings } from './i18n.js';
import type { Project } from './model.js';

/** Changed lines with `context` unchanged lines around them; longer unchanged runs become a count. */
export function hunks(lines: LineDiff[], context = 2): (LineDiff | number)[] {
  const keep = lines.map(() => false);
  lines.forEach((line, i) => {
    if (line.op !== ' ')
      for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const out: (LineDiff | number)[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (keep[i]) out.push(lines[i]!);
    else if (typeof out[out.length - 1] === 'number') (out[out.length - 1] as number)++;
    else out.push(1);
  }
  return out;
}

type Side = LineDiff | number | undefined;

/** Side by side: a run of removed lines faces the run of added lines after it; unchanged lines sit on both sides. */
export function pairs(lines: (LineDiff | number)[]): [Side, Side][] {
  const out: [Side, Side][] = [];
  const run = (i: number, op: '-' | '+'): LineDiff[] => {
    const taken: LineDiff[] = [];
    for (let l = lines[i]; typeof l === 'object' && l.op === op; l = lines[++i]) taken.push(l);
    return taken;
  };
  for (let i = 0; i < lines.length;) {
    const l = lines[i]!;
    if (typeof l === 'number' || l.op === ' ') {
      out.push([l, l]);
      i++;
      continue;
    }
    const del = run(i, '-');
    const ins = run(i + del.length, '+');
    for (let k = 0; k < Math.max(del.length, ins.length); k++) out.push([del[k], ins[k]]);
    i += del.length + ins.length;
  }
  return out;
}

const sizes = (r: ResourceDiff): string =>
  r.sizeBefore !== undefined && r.sizeAfter !== undefined && r.sizeBefore !== r.sizeAfter
    ? `${formatSize(r.sizeBefore)} → ${formatSize(r.sizeAfter)}`
    : formatSize((r.sizeAfter ?? r.sizeBefore)!);

const SIGN: Record<Status | 'renamed', string> = {
  added: '+',
  removed: '-',
  modified: '~',
  renamed: '~',
  unchanged: ' ',
};

/** Terminal report: only what changed, in the usual diff colours. */
export function renderText(diff: ElpxDiff, options: { lang?: Lang; color?: boolean } = {}): string {
  const t = strings(options.lang ?? 'en');
  const paint = (code: string, s: string): string => (options.color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const COLOR: Record<string, string> = { '+': '32', '-': '31', '~': '33', ' ': '2' };
  const mark = (status: Status | 'renamed', s: string): string => paint(COLOR[SIGN[status]]!, `${SIGN[status]} ${s}`);
  const out: string[] = [
    paint('1', `${diff.before.name || diff.before.title} → ${diff.after.name || diff.after.title}`),
    `${paint('32', `+${diff.summary.added} ${t.addedMany.toLowerCase()}`)} · ${paint('33', `~${diff.summary.modified} ${t.modifiedMany.toLowerCase()}`)} · ${paint('31', `-${diff.summary.removed} ${t.removedMany.toLowerCase()}`)}`,
  ];
  if (diff.identical) return `${out.join('\n')}\n${t.identical}\n`;

  if (diff.metadata.length) {
    out.push('', paint('1', t.metadata));
    for (const m of diff.metadata) {
      const value =
        m.status === 'modified'
          ? `${JSON.stringify(m.before)} → ${JSON.stringify(m.after)}`
          : JSON.stringify(m.after ?? m.before);
      out.push(`  ${mark(m.status, `${m.key}: ${value}`)}`);
    }
  }
  const changedPages = diff.pages.filter((p) => p.status !== 'unchanged');
  if (changedPages.length) out.push('', paint('1', t.pages));
  for (const page of changedPages) {
    const notes = [
      page.oldTitle !== undefined ? `${t.wasCalled} "${page.oldTitle}"` : '',
      page.moved ? t.moved.toLowerCase() : '',
    ].filter(Boolean);
    out.push(
      `${'  '.repeat(page.depth + 1)}${mark(page.status, (page.title || t.untitled) + (notes.length ? ` (${notes.join(', ')})` : ''))}`,
    );
    const pad = '  '.repeat(page.depth + 2);
    for (const block of page.blocks) {
      if (block.status === 'unchanged') continue;
      const blockNotes = [
        block.oldName !== undefined ? `${t.wasCalled} "${block.oldName}"` : '',
        block.moved ? t.moved.toLowerCase() : '',
      ].filter(Boolean);
      if (block.name || blockNotes.length)
        out.push(
          `${pad}${mark(block.status, `[${block.name}]${blockNotes.length ? ` (${blockNotes.join(', ')})` : ''}`)}`,
        );
      for (const idevice of block.idevices) {
        if (idevice.status === 'unchanged') continue;
        const flags = [idevice.moved ? t.moved.toLowerCase() : '', idevice.formatOnly ? t.formatOnly : ''].filter(
          Boolean,
        );
        out.push(`${pad}  ${mark(idevice.status, idevice.type + (flags.length ? ` (${flags.join(', ')})` : ''))}`);
        for (const line of hunks(idevice.lines)) {
          if (typeof line === 'number') out.push(`${pad}      ${paint('2', `… ${t.skipped(line)}`)}`);
          else if (line.op === ' ') out.push(`${pad}      ${line.text}`);
          else {
            // Changed words in reverse video, as git's word diff does.
            const body = line.words
              ? line.words.map((w) => paint(COLOR[line.op]! + (w.changed ? ';7' : ''), w.text)).join('')
              : paint(COLOR[line.op]!, line.text);
            out.push(`${pad}    ${paint(COLOR[line.op]!, line.op)} ${body}`);
          }
        }
      }
    }
  }
  if (diff.resources.length) {
    out.push('', paint('1', t.resources));
    for (const r of diff.resources)
      out.push(`  ${mark(r.status, `${r.oldPath ? `${r.oldPath} → ` : ''}${r.path} (${sizes(r)})`)}`);
  }
  return `${out.join('\n')}\n`;
}

/**
 * A whole project as stable plain text, one fact per line: the `textconv`
 * that lets `git diff` compare .elpx files with its own line diff.
 */
export function projectToText(project: Project): string {
  const out: string[] = [];
  for (const [key, value] of project.meta) out.push(`${key}: ${value}`);
  for (const page of project.pages) {
    out.push('', `${'#'.repeat(Math.min(page.depth, 5) + 1)} ${page.title}`);
    for (const block of page.blocks) {
      out.push('', `[${block.name}]`);
      for (const idevice of block.idevices) out.push('', `<${idevice.type}>`, ...idevice.lines);
    }
  }
  out.push('');
  for (const [path, r] of [...project.resources].sort(([x], [y]) => x.localeCompare(y))) {
    out.push(`${path} (${r.size} bytes, crc ${r.crc.toString(16).padStart(8, '0')})`);
  }
  return `${out.join('\n')}\n`;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The comparison as an HTML fragment (the web app and the report share it).
 * Every piece of project text goes through esc(): nothing from an .elpx is
 * ever inserted as markup.
 */
export function renderHtml(diff: ElpxDiff, lang: Lang = 'en', options: { split?: boolean } = {}): string {
  const t = strings(lang);
  const badge = (status: Status | 'renamed' | 'moved'): string => `<span class="badge ${status}">${t[status]}</span>`;
  const badges = (status: Status, moved: boolean, renamed: boolean): string =>
    [badge(status), renamed ? badge('renamed') : '', moved ? badge('moved') : ''].join('');
  const was = (old: string | undefined): string =>
    old === undefined ? '' : ` <del class="old-name">${esc(old || t.untitled)}</del>`;

  const body = (l: LineDiff): string =>
    l.words ? l.words.map((w) => (w.changed ? `<mark>${esc(w.text)}</mark>` : esc(w.text))).join('') : esc(l.text);
  const line = (l: LineDiff | number): string => {
    if (typeof l === 'number') return `<li class="skip">⋯ ${t.skipped(l)}</li>`;
    if (l.op === ' ')
      return `<li class="ctx"><span class="sign" aria-hidden="true"></span><span class="txt">${esc(l.text)}</span></li>`;
    const [tag, label, sign] = l.op === '+' ? ['ins', t.addedLine, '+'] : ['del', t.removedLine, '−'];
    return `<li class="${tag}"><span class="sign" aria-hidden="true">${sign}</span><${tag} class="txt"><span class="sr">${label}</span>${body(l)}</${tag}></li>`;
  };
  const cell = (l: Side): string => {
    if (l === undefined) return '<td class="empty"></td>';
    if (typeof l === 'number' || l.op === ' ')
      return `<td class="ctx">${typeof l === 'number' ? '' : esc(l.text)}</td>`;
    const [tag, label] = l.op === '+' ? ['ins', t.addedLine] : ['del', t.removedLine];
    return `<td class="${tag}"><${tag}><span class="sr">${label}</span>${body(l)}</${tag}></td>`;
  };
  const split = (lines: (LineDiff | number)[]): string =>
    `<table class="split"><thead><tr><th scope="col">${t.before}</th><th scope="col">${t.after}</th></tr></thead><tbody>${pairs(
      lines,
    )
      .map(([a, b]) =>
        typeof a === 'number'
          ? `<tr class="skip"><td colspan="2">⋯ ${t.skipped(a)}</td></tr>`
          : `<tr>${cell(a)}${cell(b)}</tr>`,
      )
      .join('')}</tbody></table>`;
  /** A box's badge says what happened to the box itself; edits inside it are marked on its iDevices. */
  const own = (b: BlockDiff): boolean =>
    b.status === 'added' || b.status === 'removed' || b.moved || b.oldName !== undefined;
  const idevice = (i: IdeviceDiff): string => {
    const head = `<code class="type">${esc(i.type)}</code>`;
    if (i.status === 'unchanged') {
      const text = i.lines[0]?.text ?? t.empty;
      const first = text.length > 90 ? `${text.slice(0, 90)}…` : text;
      return `<details class="idevice unchanged"><summary>${head}<span class="snippet">${esc(first)}</span>${badge('unchanged')}</summary><ol class="lines">${i.lines.map(line).join('')}</ol></details>`;
    }
    const lines = i.status === 'modified' ? hunks(i.lines) : i.lines;
    const list = lines.length ? `<ol class="lines">${lines.map(line).join('')}</ol>` : '';
    return `<article class="idevice ${i.status}"><header>${head}${badges(i.status, i.moved, false)}</header>${
      i.formatOnly ? `<p class="note">${t.formatOnly}</p>` : ''
    }${options.split && i.status === 'modified' ? split(lines) : list}</article>`;
  };

  const s = diff.summary;
  const html = `<section class="summary" aria-label="${t.summary}"><ul class="stats">
<li class="stat added"><b>+${s.added}</b> ${t.addedMany}</li>
<li class="stat modified"><b>${s.modified}</b> ${t.modifiedMany}</li>
<li class="stat removed"><b>−${s.removed}</b> ${t.removedMany}</li></ul>${diff.identical ? `<p class="identical">${t.identical}</p>` : ''}</section>`;

  /** Long lists start folded, so a project with hundreds of files does not bury the pages. */
  const fold = (rows: number): string => (rows > 30 ? '' : ' open');
  const pages = `<section><h2>${t.pages}</h2>${diff.pages
    .map(
      (p, n) =>
        `<details id="page-${n}" class="page ${p.status} depth-${Math.min(p.depth, 4)}"${p.status === 'unchanged' ? '' : ' open'}><summary><h3>${esc(p.title || t.untitled)}${was(p.oldTitle)}</h3>${badges(p.status, p.moved, p.oldTitle !== undefined)}</summary>${p.blocks
          .map(
            (b) =>
              `<div class="block ${b.status}">${
                b.name || b.oldName !== undefined || own(b)
                  ? `<h4>${esc(b.name)}${was(b.oldName)}${own(b) ? badges(b.status, b.moved, b.oldName !== undefined) : ''}</h4>`
                  : ''
              }${b.idevices.map(idevice).join('')}</div>`,
          )
          .join('')}</details>`,
    )
    .join('')}</section>`;

  const metadata = diff.metadata.length
    ? `<section id="metadata"><details${fold(diff.metadata.length)}><summary><h2>${t.metadata} (${diff.metadata.length})</h2></summary><div class="scroll"><table><thead><tr><th scope="col">${t.property}</th><th scope="col">${t.before}</th><th scope="col">${t.after}</th></tr></thead><tbody>${diff.metadata
        .map(
          (m) =>
            `<tr><th scope="row"><code>${esc(m.key)}</code></th><td>${m.before === undefined ? '' : `<del>${esc(m.before)}</del>`}</td><td>${m.after === undefined ? '' : `<ins>${esc(m.after)}</ins>`}</td></tr>`,
        )
        .join('')}</tbody></table></div></details></section>`
    : '';

  const resources = diff.resources.length
    ? `<section id="resources"><details${fold(diff.resources.length)}><summary><h2>${t.resources} (${diff.resources.length})</h2></summary><ul class="resources">${diff.resources
        .map(
          (r) =>
            `<li class="${r.status}">${badge(r.status)}<span class="path">${r.oldPath ? `<del>${esc(r.oldPath)}</del> → ` : ''}${esc(r.path)}</span><span class="size">${sizes(r)}</span></li>`,
        )
        .join('')}</ul></details></section>`
    : '';

  // The index: the page tree with the sign of each page, as the file list of a code review.
  const SIGNS: Record<Status, string> = { added: '+', removed: '−', modified: '~', unchanged: '·' };
  const also = [
    metadata ? `<li><a href="#metadata">${t.metadata} (${diff.metadata.length})</a></li>` : '',
    resources ? `<li><a href="#resources">${t.resources} (${diff.resources.length})</a></li>` : '',
  ].join('');
  const toc = `<nav class="toc" aria-label="${t.index}"><p class="label">${t.pages}</p><ul class="tree">${diff.pages
    .map(
      (p, n) =>
        `<li class="${p.status} depth-${Math.min(p.depth, 4)}"><a href="#page-${n}"><span class="sign" aria-hidden="true">${SIGNS[p.status]}</span><span><span class="sr">${t[p.status]}: </span>${esc(p.title || t.untitled)}</span></a></li>`,
    )
    .join('')}</ul>${also ? `<p class="label">${t.also}</p><ul>${also}</ul>` : ''}</nav>`;

  return `${html}<div class="layout">${toc}<div class="doc">${pages}${metadata}${resources}</div></div>`;
}
