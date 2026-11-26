import { expect, test } from 'bun:test';

import { diffElpx, type LineDiff } from '../src/diff.js';
import { formatSize, strings } from '../src/i18n.js';
import { ideviceName } from '../src/idevices.js';
import { loadProject } from '../src/model.js';
import { hunks, pairs, projectToText, renderHtml, renderText } from '../src/render.js';
import { renderReport } from '../src/report.js';
import { elpx, type P, single, v1, v2 } from './helpers.js';

const changes = (): ReturnType<typeof diffElpx> => diffElpx(v1(), v2(), { before: 'v1.elpx', after: 'v2.elpx' });
const long = (middle: string): string =>
  `<p>${['a', 'b', 'c', 'd', 'e', middle, 'f', 'g', 'h', 'i', 'j'].join('</p><p>')}</p>`;

test('iDevices by the name eXeLearning gives them; unknown types keep their identifier', () => {
  expect(ideviceName('az-quiz-game', 'es')).toBe('Rosco');
  expect(ideviceName('az-quiz-game', 'en')).toBe('A-Z quiz');
  expect(ideviceName('trueorfalse', 'es')).toBe('Verdadero o falso');
  expect(ideviceName('FreeTextIdevice', 'es')).toBe('FreeTextIdevice');
});

test('strings and sizes in both languages', () => {
  expect(strings('es').tally({ added: 2, modified: 0, removed: 1 })).toBe('iDevices: 2 añadidos, 1 eliminado');
  expect(strings('en').tally({ added: 0, modified: 1, removed: 0 })).toBe('iDevices: 1 modified');
  expect(strings('es').changedPages(1)).toBe('1 página con cambios');
  expect(strings('es').unchangedPages(2)).toBe('2 páginas sin cambios.');
  expect(strings('en').unchangedPages(2)).toBe('2 pages without changes.');
  expect(strings('es').skipped(3)).toBe('3 líneas sin cambios');
  expect(strings('es').skipped(1)).toBe('1 línea sin cambios');
  expect(strings('en').skipped(1)).toBe('1 unchanged line');
  expect(strings('en').skipped(3)).toBe('3 unchanged lines');
  expect(Object.keys(strings('en'))).toEqual(Object.keys(strings('es')));
  // Every message with a value reads as a sentence in both languages.
  for (const lang of ['es', 'en'] as const)
    for (const value of Object.values(strings(lang)))
      if (typeof value === 'function') expect((value as (...args: unknown[]) => string)(2, 1, 'X')).toMatch(/\p{L}/u);
  expect(strings('en').renamedTo('Unit two')).toBe('In the new version it is called “Unit two”.');
  expect(strings('es').addedHere(2)).toBe('Añadido en la versión nueva (2)');
  expect([0, 999, 1000, 1_500_000, 2_000_000_000, 5e12].map(formatSize)).toEqual([
    '0 B',
    '999 B',
    '1.0 kB',
    '1.5 MB',
    '2.0 GB',
    '5000.0 GB',
  ]);
});

test('hunks keep context around changes and count what they skip', () => {
  const line = (op: LineDiff['op'], text: string): LineDiff => ({ op, text });
  const lines = [...'abcde'].map((t) => line(' ', t)).concat(line('+', 'X'), ...[...'fghij'].map((t) => line(' ', t)));
  expect(hunks(lines, 1).map((h) => (typeof h === 'number' ? h : h.text))).toEqual([4, 'e', 'X', 'f', 4]);
  expect(hunks(lines).map((h) => (typeof h === 'number' ? h : h.text))).toEqual([3, 'd', 'e', 'X', 'f', 'g', 3]);
  expect(hunks([line(' ', 'a')])).toEqual([1]);
  expect(hunks([])).toEqual([]);
});

test('pairs: removed runs face the added runs after them; context and skips sit on both sides', () => {
  const line = (op: LineDiff['op'], text: string): LineDiff => ({ op, text });
  const show = (s: LineDiff | number | undefined): string =>
    s === undefined ? '_' : typeof s === 'number' ? `${s}` : s.text;
  const lines = [
    3,
    line(' ', 'a'),
    line('-', 'b'),
    line('-', 'c'),
    line('+', 'B'),
    line('+', 'x'),
    line('+', 'y'),
    line('-', 'z'),
  ];
  expect(pairs(lines).map(([l, r]) => `${show(l)}|${show(r)}`)).toEqual(['3|3', 'a|a', 'b|B', 'c|x', '_|y', 'z|_']);
  expect(pairs([])).toEqual([]);
});

test('HTML side by side: modified iDevices in two columns, the rest as before', async () => {
  const html = renderHtml(await changes(), 'es', { split: true });
  expect(html).toContain(
    '<table class="split"><thead><tr><th scope="col">Antes</th><th scope="col">Después</th></tr></thead>',
  );
  expect(html).toContain(
    '<tr><td class="del"><del><span class="sr">Eliminado: </span>¿Cuál es la capital de <mark>España</mark>?</del></td><td class="ins"><ins><span class="sr">Añadido: </span>¿Cuál es la capital de <mark>Canarias</mark>?</ins></td></tr>',
  );
  expect(html).toContain('<tr><td class="ctx">Elige una.</td><td class="ctx">Elige una.</td></tr>');
  expect(html).toContain('<article class="idevice removed"><header><span class="type"'); // whole iDevices stay in one column
  expect(html).not.toContain(
    '<li class="del"><span class="sign" aria-hidden="true">−</span><del class="txt"><span class="sr">Eliminado: </span>¿Cuál',
  );
  const skipped = renderHtml(await diffElpx(single(long('uno')), single(long('dos'))), 'en', { split: true });
  expect(skipped).toContain('<tr class="skip"><td colspan="2">⋯ 3 unchanged lines</td></tr>');
  const uneven = renderHtml(await diffElpx(single(long('uno')), single(long('dos</p><p>tres'))), 'en', { split: true });
  expect(uneven).toContain(
    '<tr><td class="empty"></td><td class="ins"><ins><span class="sr">Added: </span>tres</ins></td></tr>',
  );
  expect(renderReport(await changes(), 'es', { split: true })).toContain('<table class="split">');
});

test('terminal report: only what changed, in the language asked', async () => {
  const text = renderText(await changes(), { lang: 'es' });
  expect(text).toStartWith('v1.elpx → v2.elpx\n+3 añadidos · ~3 modificados · -2 eliminados\n');
  expect(text).toContain('Metadatos\n  + pp_author: "ATE"');
  expect(text).toContain(
    '- ¿Cuál es la capital de España?\n        + ¿Cuál es la capital de Canarias?\n          Elige una.',
  );
  expect(text).toContain('~ Unidad dos (antes "Unidad 2")');
  expect(text).toContain('~ content/resources/guia.pdf → content/resources/manual.pdf (3 B)');
  expect(text).not.toContain('Texto introductorio');
  expect(text).not.toContain('\x1b[');
  expect(renderText(await changes())).toContain('+3 added · ~3 modified · -2 removed');
});

test('terminal report: colours, changed words in reverse video, skipped runs', async () => {
  const text = renderText(await changes(), { color: true });
  expect(text).toContain('\x1b[31;7mEspaña\x1b[0m');
  expect(text).toContain('\x1b[32;7mCanarias\x1b[0m');
  expect(text).toContain('\x1b[32m+ content/resources/intro.mp4 (3 B)\x1b[0m');
  const skipped = renderText(await diffElpx(single(long('viejo')), single(long('nuevo y distinto del todo'))), {
    lang: 'en',
  });
  expect(skipped).toContain('… 3 unchanged lines');
  expect(skipped).toContain('- viejo\n        + nuevo y distinto del todo');
});

test('terminal report: identical projects, titles when there are no file names', async () => {
  expect(renderText(await diffElpx(v1(), v1()), { lang: 'es' })).toBe(
    'Recurso → Recurso\n+0 añadidos · ~0 modificados · -0 eliminados\nLos dos proyectos tienen el mismo contenido.\n',
  );
});

test('terminal report: moved and renamed pages and boxes, format changes, changed metadata and sizes', async () => {
  const a = elpx(
    [
      { id: 'p1', title: 'Uno' },
      { id: 'p2', title: '', blocks: [{ id: 'b', name: 'Antes', idevices: [{ id: 'i', html: '<p>Hola</p>' }] }] },
    ],
    { 'content/resources/f.txt': 'x' },
    { pp_title: 'A' },
  );
  const b = elpx(
    [
      {
        id: 'p2',
        title: '',
        blocks: [{ id: 'b', name: 'Después', idevices: [{ id: 'i', html: '<p><em>Hola</em></p>' }] }],
      },
      { id: 'p1', title: 'Uno' },
    ],
    { 'content/resources/f.txt': 'xyz' },
    { pp_title: 'B' },
  );
  const text = renderText(await diffElpx(a, b), { lang: 'en' });
  expect(text).toContain('~ pp_title: "A" → "B"');
  expect(text).toContain('~ (untitled)\n');
  expect(text).toContain('~ Uno (moved)');
  expect(text).toContain('~ [Después] (was "Antes")');
  expect(text).toContain('~ Text (Same text; formatting or settings changed.)');
  expect(text).toContain('~ content/resources/f.txt (1 B → 3 B)');
});

test('project as text: one fact per line, stable', async () => {
  const text = projectToText(await loadProject(v1()));
  expect(text).toBe(`pp_title: Recurso

# Unidad 1 — Introducción

[Presentación]

<text>
Texto introductorio

[Actividad de evaluación]

<text>
¿Cuál es la capital de España?
Elige una.

<text>
[img: mapa.png — Mapa]

# Unidad 2

content/resources/guia.pdf (3 bytes, crc 98579906)
content/resources/mapa.png (3 bytes, crc 15bf411a)
`);
  const nested = await loadProject(
    elpx([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B', parent: 'a' },
    ]),
  );
  expect(projectToText(nested)).toContain('# A\n\n## B\n');
});

test('HTML: summary, sections, badges and the diff lines', async () => {
  const html = renderHtml(await changes(), 'es');
  expect(html).toContain('<li class="stat added"><b>+3</b> Añadidos</li>');
  expect(html).toContain('<li class="stat removed"><b>−2</b> Eliminados</li>');
  expect(html).toContain('<section id="metadata"><details open><summary><h2>Metadatos (1)</h2></summary>');
  expect(html).toContain('<td></td><td><ins>ATE</ins></td>');
  expect(html).toContain('<details id="page-0" class="page modified depth-0" open>');
  // Each page says under its title how many of its iDevices changed.
  expect(html).toContain('<span class="counts">iDevices: 1 añadido, 1 modificado, 1 eliminado</span></summary>');
  expect(html).toContain(
    '<h3>Unidad dos <del class="old-name">Unidad 2</del></h3><span class="badge modified">Modificado</span><span class="badge renamed">Renombrado</span>',
  );
  expect(html).toContain(
    '<li class="del"><span class="sign" aria-hidden="true">−</span><del class="txt"><span class="sr">Eliminado: </span>¿Cuál es la capital de <mark>España</mark>?</del></li>',
  );
  expect(html).toContain(
    '<ins class="txt"><span class="sr">Añadido: </span>¿Cuál es la capital de <mark>Canarias</mark>?</ins>',
  );
  expect(html).toContain(
    '<li class="ctx"><span class="sign" aria-hidden="true"></span><span class="txt">Elige una.</span></li>',
  );
  expect(html).toContain(
    '<details class="idevice unchanged"><summary><span class="type" title="text">Texto</span><span class="snippet">Texto introductorio</span>',
  );
  expect(html).toContain('<article class="idevice removed">');
  expect(html).toContain(
    '<li class="renamed"><span class="badge renamed">Renombrado</span><span class="path"><del>content/resources/guia.pdf</del> → content/resources/manual.pdf</span>',
  );
  expect(html).toContain(
    '<section id="resources"><details open><summary><h2>Archivos (3)</h2></summary><ul class="resources">',
  );
  expect(html).not.toContain('class="identical"');
  // The index: every page with its sign, and links to the other sections that changed.
  expect(html).toContain(
    '<nav class="toc" aria-label="Índice de cambios"><details open><summary title="Índice de cambios"><svg aria-hidden="true"',
  );
  expect(html).toContain(
    '</svg><span class="sr">Índice de cambios</span></summary><p class="label">Páginas</p><ul class="tree"><li class="modified depth-0"><a href="#page-0"><span class="sign" aria-hidden="true">~</span><span><span class="sr">Modificado: </span>Unidad 1 — Introducción</span></a></li>',
  );
  expect(html).toContain(
    '<p class="label">También cambia</p><ul><li><a href="#metadata">Metadatos (1)</a></li><li><a href="#resources">Archivos (3)</a></li></ul></details></nav>',
  );
  expect(html.indexOf('id="page-0"')).toBeLessThan(html.indexOf('id="metadata"'));
  expect(renderHtml(await changes())).toContain('<h2>Pages</h2>');
});

test('HTML: identical projects, long snippets, empty iDevices, skipped runs, depth and box badges', async () => {
  const same = renderHtml(await diffElpx(v1(), v1()), 'en');
  expect(same).toContain('<p class="identical">Both projects have the same content.</p>');
  expect(same).not.toContain('id="metadata"');
  expect(same).not.toContain('id="resources"');
  expect(same).toContain('<details id="page-0" class="page unchanged depth-0">');
  expect(same).toContain(
    '<li class="unchanged depth-0"><a href="#page-0"><span class="sign" aria-hidden="true">·</span>',
  );
  expect(same).not.toContain('Also changed');

  const snippet = renderHtml(
    await diffElpx(single(`<p>${'x'.repeat(200)}</p>`), single(`<p>${'x'.repeat(200)}</p>`)),
    'en',
  );
  expect(snippet).toContain(`<span class="snippet">${'x'.repeat(90)}…</span>`);
  expect(renderHtml(await diffElpx(single(''), single('')), 'es')).toContain(
    '<span class="snippet">(sin texto)</span>',
  );
  expect(renderHtml(await diffElpx(single(long('uno')), single(long('dos'))), 'es')).toContain(
    '<li class="skip">⋯ 3 líneas sin cambios</li>',
  );
  expect(renderHtml(await diffElpx(single('<p>a</p>'), single('<p><b>a</b></p>')), 'en')).toContain(
    '<p class="note">Same text; formatting or settings changed.</p>',
  );

  const deep: P[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, n, all) => ({
    id,
    title: n === 0 ? '' : id,
    ...(n ? { parent: all[n - 1]! } : {}),
  }));
  const tree = renderHtml(await diffElpx(elpx(deep), elpx(deep)), 'es');
  expect(tree).toContain('depth-4"><summary><h3>f</h3>'); // capped
  expect(tree).toContain('<h3>(sin título)</h3>');

  const box = (name: string, pageName: string): Uint8Array =>
    elpx([{ id: 'p', title: pageName, blocks: [{ id: 'b', name, idevices: [{ id: 'i', html: '<p>x</p>' }] }] }]);
  const renamed = renderHtml(await diffElpx(box('Antes', 'P'), box('', 'P')), 'en');
  expect(renamed).toContain(
    '<h4> <del class="old-name">Antes</del><span class="badge modified">Modified</span><span class="badge renamed">Renamed</span></h4>',
  );
  const added = renderHtml(await diffElpx(elpx([{ id: 'p', title: 'P' }]), box('Nueva', 'P')), 'en');
  expect(added).toContain(
    '<div class="block added"><h4>Nueva<span class="badge added">Added</span></h4><article class="idevice added">',
  );
  const anonymous = renderHtml(await diffElpx(box('', 'P'), box('', 'P')), 'en');
  expect(anonymous).toContain('<div class="block unchanged"><details');
});

test('HTML: long lists start folded', async () => {
  const files = (n: number): Record<string, string> =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`content/resources/f${i}.txt`, 'x']));
  const page: P[] = [{ id: 'p', title: 'P' }];
  expect(renderHtml(await diffElpx(elpx(page), elpx(page, files(30))), 'en')).toContain(
    '<details open><summary><h2>Files (30)</h2>',
  );
  expect(renderHtml(await diffElpx(elpx(page), elpx(page, files(31))), 'en')).toContain(
    '<details><summary><h2>Files (31)</h2>',
  );
});

test('project text is never inserted as markup', async () => {
  const evil = '&lt;img src=x onerror=alert(1)&gt;';
  const a = elpx(
    [{ id: 'p', title: evil }],
    { 'content/resources/<q>.txt': 'x' },
    { pp_title: evil, '&lt;i&gt;k': '1' },
  );
  const b = elpx(
    [
      {
        id: 'p',
        title: evil,
        blocks: [{ id: 'b', name: evil, idevices: [{ id: 'i', type: '&lt;u&gt;t', html: `<p>${evil} "q" 'q'</p>` }] }],
      },
    ],
    {},
    { pp_title: `${evil}!` },
  );
  for (const html of [
    renderHtml(await diffElpx(a, b), 'es'),
    renderReport(await diffElpx(a, b, { before: '<s>a</s>', after: 'b' }), 'es'),
  ]) {
    for (const tag of ['<img', '<q>', '<i>', '<u>', '<s>']) expect(html).not.toContain(tag);
    expect(html).toContain('&#60;img src=x onerror=alert(1)&#62; &#34;q&#34; &#39;q&#39;');
  }
});

test('report: a whole page with its styles and no scripts', async () => {
  const report = renderReport(await changes(), 'es');
  expect(report).toStartWith('<!doctype html>\n<html lang="es">');
  expect(report).toContain('<title>v1.elpx → v2.elpx · elpx-diff</title>');
  expect(report).toContain('<h1>Comparación de proyectos eXeLearning</h1>');
  expect(report).toContain('--add-bg:');
  expect(report).not.toContain('<script');
  expect(renderReport(await diffElpx(v1(), v2()))).toContain('<title>Recurso → Recurso · elpx-diff</title>');
});
