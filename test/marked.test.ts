import { expect, test } from 'bun:test';

import { strFromU8, unzipSync } from 'fflate';

import { diffElpx, type PageDiff } from '../src/diff.js';
import { markedSite, markProject, resolvePath, SUMMARY_PAGE } from '../src/marked.js';
import { elpx, elpxWithSite, type P, v1 } from './helpers.js';

const OLD: P[] = [
  {
    id: 'p1',
    title: 'Unidad 1',
    blocks: [
      {
        id: 'b1',
        name: 'Actividad',
        idevices: [
          { id: 'i1', html: '<p>Texto introductorio</p>' },
          { id: 'i2', html: '<p>¿Cuál es la capital de España?</p>' },
          { id: 'i3', html: '<p><img src="{{context_path}}/content/resources/mapa.png" alt="Mapa" /></p>' },
        ],
      },
    ],
  },
  { id: 'p2', title: 'Unidad 2', blocks: [{ id: 'b2', name: '', idevices: [{ id: 'i5', html: '<p>Igual</p>' }] }] },
];
const NEW: P[] = [
  {
    id: 'p1',
    title: 'Unidad 1',
    blocks: [
      {
        id: 'b1',
        name: 'Actividad',
        idevices: [
          { id: 'i1', html: '<p>Texto introductorio</p>' },
          { id: 'i2', html: '<p>¿Cuál es la capital de Canarias?</p>' },
          { id: 'i4', html: '<p>Nuevo vídeo explicativo</p>' },
        ],
      },
    ],
  },
  { id: 'p2', title: 'Unidad dos', blocks: [{ id: 'b2', name: '', idevices: [{ id: 'i5', html: '<p>Igual</p>' }] }] },
  { id: 'p3', title: 'Unidad 3', blocks: [{ id: 'b3', name: '', idevices: [{ id: 'i6', html: '<p>Nueva</p>' }] }] },
];

const open = (zip: Uint8Array): Record<string, string> =>
  Object.fromEntries(Object.entries(unzipSync(zip)).map(([name, data]) => [name, strFromU8(data)]));

test('marked copy: changed iDevices marked in place, a box on each page and a summary page', async () => {
  const [a, b] = [elpxWithSite(OLD), elpxWithSite(NEW, { 'content/resources/foto.jpg': 'JPG' })];
  const { zip, diff } = await markedSite(a, b, { lang: 'es', names: { before: 'v1.elpx', after: 'v2.elpx' } });
  expect(diff).toEqual(await diffElpx(a, b, { before: 'v1.elpx', after: 'v2.elpx' }));
  const files = open(zip);
  // The whole package travels: the pages, their files and a summary page next to index.html.
  expect(Object.keys(files).sort()).toEqual(
    ['content.xml', 'content/resources/foto.jpg', 'html/p2.html', 'html/p3.html', 'index.html', SUMMARY_PAGE].sort(),
  );
  expect(files['content/resources/foto.jpg']).toBe('JPG');

  const index = files['index.html']!;
  expect(index).toContain('<div id="i1" class="idevice_node text" data-idevice-type="text">');
  // Right before a modified iDevice, what changed in it, in one line when it was edited; never inside it.
  expect(index).toContain(
    '<details class="elpx-diff-changes" lang="es" open><summary>Modificado</summary><ol><li class="mix"><span class="sign" aria-hidden="true">~</span><span class="txt">¿Cuál es la capital de <del>España</del><ins>Canarias</ins>?</span></li></ol></details><div id="i2" data-elpx-diff="modified" class="idevice_node text"',
  );
  expect(index).toContain('<p class="elpx-diff-tag added" lang="es">Añadido</p><div id="i4" data-elpx-diff="added"');
  expect(index).toContain('<style id="elpx-diff-marks">');
  expect(index.indexOf('<style id="elpx-diff-marks">')).toBeLessThan(index.indexOf('</head>'));
  // The box opens the page's content column, after the page header.
  expect(index).toContain('class="page-content"><aside class="elpx-diff-box" lang="es">');
  expect(index).toContain('<p data-elpx-diff-p="edited">¿Cuál es la capital de Canarias?</p>');
  // The bar in the corner: counts, key, marks on and off, the list.
  expect(index).toContain(
    '<div class="elpx-diff-float" lang="es" role="region" aria-label="Cambios en esta página"><strong>iDevices: 1 añadido, 1 modificado, 1 eliminado · párrafos: 1 retocado</strong>',
  );
  expect(index).toContain(
    '<button type="button" aria-pressed="false" onclick="var off=document.documentElement.classList.toggle(&#39;elpx-diff-off&#39;);this.textContent=off?&#34;Mostrar las marcas&#34;:&#34;Ocultar las marcas&#34;;',
  );
  expect(index.indexOf('elpx-diff-float')).toBeLessThan(index.indexOf('</body>'));
  expect(index).toContain('<summary>Eliminado (1)</summary><ul><li>Texto: <del>[img: mapa.png — Mapa]</del></li>');
  expect(index).toContain(`<a href="${SUMMARY_PAGE}">Todas las páginas con cambios</a>`);

  const renamed = files['html/p2.html']!;
  expect(renamed).toContain('<p>Antes se llamaba «Unidad 2».</p>');
  expect(renamed).not.toContain('data-elpx-diff="');
  expect(renamed).not.toContain('Sin cambios');
  expect(renamed).toContain(`<a href="../${SUMMARY_PAGE}">`);
  expect(files['html/p3.html']).toContain('<p>Página nueva.</p>');

  // The most changed first, each a link that opens apart.
  const summary = files[SUMMARY_PAGE]!;
  expect(summary).toStartWith('<!doctype html>\n<html lang="es">');
  expect(summary).toContain('<p class="compare">v1.elpx → v2.elpx</p>');
  expect(summary).toContain('<h2>3 páginas con cambios</h2>');
  const rows = [...summary.matchAll(/<tr><th scope="row"><a href="([^"]+)" target="_blank" rel="noopener">/g)];
  expect(rows.map((m) => m[1])).toEqual(['index.html', 'html/p3.html', 'html/p2.html']);
  expect(summary).toContain('Unidad 3</a> <small>(añadido)</small></th><td>1</td><td></td><td></td>');
  expect(summary).toContain('Unidad dos</a> <small>(renombrado)</small>');
  expect(summary).not.toContain('sin cambios');
});

test('marked copy: unchanged and removed pages, moved iDevices and format changes, in English', async () => {
  const pages = (second: string, third: string): P[] => [
    { id: 'p1', title: 'Same', blocks: [{ id: 'b1', name: '', idevices: [{ id: 'i1', html: '<p>Same</p>' }] }] },
    {
      id: 'p2',
      title: 'Edited',
      blocks: [
        { id: 'b2', name: 'One', idevices: [{ id: 'i2', html: second }] },
        { id: 'b3', name: 'Two', idevices: [{ id: 'i3', html: third }] },
      ],
    },
  ];
  const before = elpxWithSite([
    ...pages('<p>Text</p>', '<p>Moved</p>'),
    { id: 'p9', title: 'Gone', blocks: [{ id: 'b9', name: '', idevices: [{ id: 'i9', html: '<p>Bye</p>' }] }] },
  ]);
  const after = pages('<p><b>Text</b></p>', '<p>Moved</p>');
  // i3 changes box: moved; i2 changes markup only.
  after[1]!.blocks![0]!.idevices.push(after[1]!.blocks![1]!.idevices.pop()!);
  const files = open((await markedSite(before, elpxWithSite(after))).zip);
  expect(files['index.html']).toContain('<strong>No changes on this page.</strong>');
  expect(files['index.html']).not.toContain('<aside class="elpx-diff-box"'); // nothing to tell at the top
  const edited = files['html/p2.html']!;
  expect(edited).toContain(
    '<summary>Modified · formatting</summary><p class="elpx-diff-note">Same text; formatting or settings changed.</p></details><div id="i2" data-elpx-diff="modified"',
  );
  expect(edited).toContain(
    '<summary>Modified · moved</summary><p class="elpx-diff-note">Same content; it moved.</p></details><div id="i3" data-elpx-diff="modified"',
  );
  expect(edited).toContain('<strong>iDevices: 2 modified</strong>');
  const summary = files[SUMMARY_PAGE]!;
  expect(summary).toContain('<h2>1 page with changes</h2>');
  expect(summary).toContain('<p>1 page without changes.</p>');
  expect(summary).toContain('<h2>Removed pages</h2><ul><li><del>Gone</del></li></ul>');
  expect(summary).not.toContain('html/p9.html');
});

test('marked copy: lines added or removed apart from an edit, and the unchanged ones counted', async () => {
  const page = (html: string): P[] => [
    { id: 'p1', title: 'P', blocks: [{ id: 'b1', name: '', idevices: [{ id: 'i1', html }] }] },
  ];
  const before = elpxWithSite(page('<p>one</p><p>two</p><p>three</p><p>gone for good</p>'));
  const after = elpxWithSite(page('<p>one</p><p>two</p><p>three</p><p>a brand new line</p><p>and another</p>'));
  const index = open((await markedSite(before, after)).zip)['index.html']!;
  expect(index).toContain('<li class="skip">⋯ 3 unchanged lines</li>');
  expect(index).toContain('<li class="del"><span class="sign" aria-hidden="true">−</span><del class="txt">');
  expect(index).toContain(
    '<li class="ins"><span class="sign" aria-hidden="true">+</span><ins class="txt"><span class="sr">Added: </span>and another</ins></li>',
  );
  expect(index).not.toContain('class="mix"');
});

test('marked copy: the paragraphs an iDevice gained or had edited, marked where they are', async () => {
  const page = (html: string, exported = html): Record<string, string> => ({
    'index.html': `<html><body><main id="p1"><div id="page-content-p1"><div id="i1" class="idevice_node text">${exported}</div><div id="i2" class="idevice_node text"><p>Punto nuevo</p></div></div></main></body></html>`,
  });
  const pages = (html: string): P[] => [
    {
      id: 'p1',
      title: 'P',
      blocks: [
        {
          id: 'b1',
          name: '',
          idevices: [
            { id: 'i1', html },
            { id: 'i2', html: '<p>Ajeno</p>' },
          ],
        },
      ],
    },
  ];
  const old = '<p>Hola a todos</p><p>Fin</p>';
  const now =
    '<p>Hola a todos y a todas</p><h2>Nuevo título</h2><p>Fin</p><ul><li>Punto nuevo</li></ul><p>Ver <a href="{{context_path}}/content/resources/x.pdf">el documento</a></p>';
  const exported = now.replace('{{context_path}}/', '../');
  const before = elpx(pages(old), page(old));
  const after = elpx(pages(now), page(now, exported));
  const index = open((await markedSite(before, after, { lang: 'es' })).zip)['index.html']!;
  expect(index).toContain('<h2 data-elpx-diff-p="added">Nuevo título</h2>');
  expect(index).toContain('<p data-elpx-diff-p="edited">Hola a todos y a todas</p>');
  expect(index).toContain('<li data-elpx-diff-p="added">Punto nuevo</li>');
  expect(index).toContain('<p data-elpx-diff-p="added">Ver <a href="../content/resources/x.pdf">el documento</a></p>');
  // Only inside the iDevice: the same text in the next one, unchanged, is left alone.
  expect(index).toContain('<div id="i2" class="idevice_node text"><p>Punto nuevo</p>');
  // Headings are marked, but only paragraphs are counted.
  expect(index).toContain('<strong>iDevices: 1 modificado · párrafos: 2 nuevos, 1 retocado</strong>');
});

test('the old version of a page, the new one and the changes: what is gone marked in red, and the bar switches', async () => {
  const gone: P = {
    id: 'p9',
    title: 'Vieja',
    blocks: [{ id: 'b9', name: '', idevices: [{ id: 'i9', html: '<p>Adiós</p>' }] }],
  };
  const project = await markProject(elpxWithSite([...OLD, gone]), elpxWithSite(NEW), { lang: 'es' });
  const byId = (id: string): PageDiff => project.diff.pages.find((p) => p.id === id)!;
  const [one, two, three, nine] = ['p1', 'p2', 'p3', 'p9'].map(byId);
  expect([...(await project.paths('old')).values()]).toEqual(['index.html', 'html/p2.html', 'html/p9.html']);
  expect([...(await project.paths('new')).keys()]).not.toContain(nine);
  expect(await project.page(three!, { mode: 'old' })).toBeUndefined(); // a new page has no old version

  const old = (await project.page(one!, { mode: 'old', anchor: 'i7 i2' }))!;
  expect(old).toContain('var ANCHOR = "i7 i2";');
  // The old version as it is: its marks are there, but turned off.
  expect(old).toContain("(function () {\n  document.documentElement.classList.add('elpx-diff-off');");
  expect(old).toContain(
    '<p class="elpx-diff-tag removed" lang="es">Eliminado</p><div id="i3" data-elpx-diff="removed"',
  );
  expect(old).toContain('<p data-elpx-diff-p="edited">¿Cuál es la capital de España?</p>');
  expect(old).toContain('<summary>Modificado</summary>');
  expect(old).toContain(
    '<summary>Añadido en la versión nueva (1)</summary><ul><li>Texto: <ins>Nuevo vídeo explicativo</ins></li>',
  );
  expect(old).toContain('<strong>iDevices: 1 añadido, 1 modificado, 1 eliminado · párrafos: 1 retocado</strong>');
  expect(old).toContain('<span class="elpx-diff-key removed">Eliminado</span>');
  expect(old).toContain(
    '<span class="elpx-diff-switch" role="group" aria-label="Versión"><button type="button" data-elpx-diff-mode="old" aria-pressed="true">Versión anterior</button><button type="button" data-elpx-diff-mode="both" aria-pressed="false">Cambios</button><button type="button" data-elpx-diff-mode="new" aria-pressed="false">Versión nueva</button></span>',
  );
  expect(old).not.toContain('Ocultar las marcas'); // in the viewer, the switch takes its place
  expect(await project.page(two!, { mode: 'old' })).toContain('<p>En la versión nueva se llama «Unidad dos».</p>');
  // The changes, marked on the new version, with the marks on.
  const both = (await project.page(one!))!;
  expect(both).toContain('data-elpx-diff-mode="both" aria-pressed="true"');
  expect(both).not.toContain("classList.add('elpx-diff-off')");
  expect(both).toContain('<span class="elpx-diff-key added">Añadido</span>');
  expect(await project.page(one!, { mode: 'new' })).toContain("classList.add('elpx-diff-off')");

  const removed = (await project.page(nine!))!; // only the old version: the changes are marked there
  expect(removed).toContain('<p>Esta página no está en la versión nueva.</p>');
  expect(removed).toContain('<strong>iDevices: 1 eliminado</strong>');
  expect(removed).toContain(
    '<button type="button" data-elpx-diff-mode="new" aria-pressed="false" disabled title="Esta página no está en la versión nueva">',
  );
  // A page only the new version has: its switch cannot go back.
  expect(await project.page(three!)).toContain(
    '<button type="button" data-elpx-diff-mode="old" aria-pressed="false" disabled title="Esta página no existía en la versión anterior">',
  );
  // An old page with nothing that went: no box, and paragraphs it lost counted as removed.
  const lost = await markProject(
    elpxWithSite([
      { id: 'p', title: 'P', blocks: [{ id: 'b', name: '', idevices: [{ id: 'i', html: '<p>Uno</p><p>Dos</p>' }] }] },
    ]),
    elpxWithSite([
      { id: 'p', title: 'P', blocks: [{ id: 'b', name: '', idevices: [{ id: 'i', html: '<p>Uno</p>' }] }] },
    ]),
  );
  const page = (await lost.page(lost.diff.pages[0]!, { mode: 'old' }))!;
  expect(page).toContain('<p data-elpx-diff-p="removed">Dos</p>');
  expect(page).toContain('<strong>iDevices: 1 modified · paragraphs: 1 removed</strong>');
  expect(page).not.toContain('<aside class="elpx-diff-box"');
  // Unchanged in both versions.
  const same = await markProject(elpxWithSite([{ id: 'p', title: 'P' }]), elpxWithSite([{ id: 'p', title: 'P' }]));
  expect(await same.page(same.diff.pages[0]!, { mode: 'old' })).toContain('<strong>No changes on this page.</strong>');
});

test('marked copy: ids regenerated by a tool still find the exported iDevices', async () => {
  const before = elpxWithSite([
    { id: 'p1', title: 'Page', blocks: [{ id: 'b1', name: 'Box', idevices: [{ id: 'i1', html: '<p>Hello</p>' }] }] },
    { id: 'p2', title: 'Moved page', parent: 'p1' },
  ]);
  const after = elpxWithSite([
    {
      id: 'P1',
      title: 'Page',
      blocks: [{ id: 'B1', name: 'Box', idevices: [{ id: 'I1', html: '<p>Hello world</p>' }] }],
    },
    { id: 'P2', title: 'Moved page' },
  ]);
  const files = open((await markedSite(before, after)).zip);
  expect(files['index.html']).toContain('<div id="I1" data-elpx-diff="modified"');
  expect(files['html/P2.html']).toContain('<p>Moved in the navigation.</p>');
});

test('marked copy: pages without the usual layout, unknown or repeated pages, untitled pages', async () => {
  const pages: P[] = [
    { id: 'p1', title: '', blocks: [{ id: 'b1', name: '', idevices: [] }] },
    { id: 'p2', title: 'Second' },
  ];
  const before = elpx([
    { id: 'p1', title: 'Old', blocks: [{ id: 'b1', name: '', idevices: [{ id: 'i1', html: '<p>A</p>' }] }] },
    { id: 'p2', title: 'Second' },
  ]);
  const after = elpx(pages, {
    'index.html': '<main id="p1"><div id="i1">x</div></main>',
    'html/p2.html': '<html><head></head><body><main id="p2">Second</main></body></html>',
    'html/copy.html': '<main id="p2">Copy</main>',
    'html/other.html': '<main id="nobody">Other</main>',
    'html/plain.html': '<p>No main</p>',
  });
  const files = open((await markedSite(before, after)).zip);
  // No head: the style sheet goes first; no content column: the box opens <main>.
  expect(files['index.html']).toStartWith('<style id="elpx-diff-marks">');
  expect(files['index.html']).toContain('<main id="p1"><aside class="elpx-diff-box" lang="en">');
  expect(files['index.html']).toContain('<p>Was called “Old”.</p>');
  expect(files['index.html']).toContain('<li>Text: <del>A</del></li>');
  expect(files['html/p2.html']).toContain('<main id="p2">Second</main><div class="elpx-diff-float"');
  expect(files['index.html']).toMatch(/<\/div><\/main><div class="elpx-diff-float"[^]*<\/div>$/); // no </body>: at the end
  for (const name of ['html/copy.html', 'html/other.html', 'html/plain.html'])
    expect(files[name]).not.toContain('elpx-diff');
  expect(files[SUMMARY_PAGE]).toContain(
    '<th scope="row"><a href="index.html" target="_blank" rel="noopener">(untitled)</a>',
  );
});

test('marked copy: a renamed page that has lost its title, and a removed iDevice without text', async () => {
  const before = elpxWithSite([
    { id: 'p1', title: 'Named', blocks: [{ id: 'b1', name: '', idevices: [{ id: 'i1', html: '' }] }] },
  ]);
  const after = elpxWithSite([{ id: 'p1', title: '' }]);
  const index = open((await markedSite(before, after)).zip)['index.html']!;
  expect(index).toContain('<p>Was called “Named”.</p>');
  expect(index).toContain('<li>Text: <del>(no text)</del></li>');
  const blank = elpxWithSite([{ id: 'p1', title: 'Named' }]);
  const untitled = open((await markedSite(after, blank)).zip)['index.html']!;
  expect(untitled).toContain('<p>Was called “(untitled)”.</p>');
});

test('marked copy: long removed text is cut, project text is escaped', async () => {
  const long = 'x'.repeat(200);
  const before = elpxWithSite([
    {
      id: 'p1',
      title: 'P',
      blocks: [
        {
          id: 'b1',
          name: '',
          idevices: [
            { id: 'i1', html: `<p>${long}</p>` },
            { id: 'i2', html: '<p>&lt;b&gt;</p>' },
          ],
        },
      ],
    },
  ]);
  const after = elpx([{ id: 'p1', title: '&lt;i&gt;P&lt;/i&gt;' }], { 'index.html': '<main id="p1"></main>' });
  const files = open((await markedSite(before, after)).zip);
  expect(files['index.html']).toContain(`<del>${'x'.repeat(120)}…</del>`);
  expect(files['index.html']).toContain('<del>&#60;b&#62;</del>');
  expect(files[SUMMARY_PAGE]).toContain('&#60;i&#62;P&#60;/i&#62;');
});

test('marked copy: needs the website inside the new version, and refuses one too large to unpack', async () => {
  await expect(markedSite(v1(), v1())).rejects.toThrow('The new version has no exported website inside');
  // A central directory that announces 2 GiB for one file: refused before anything is inflated.
  const bytes = elpxWithSite(NEW);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let p = 0; p + 4 <= bytes.length; p++)
    if (view.getUint32(p, true) === 0x02014b50) {
      view.setUint32(p + 24, 0x80000000, true);
      break;
    }
  await expect(markedSite(elpxWithSite(OLD), bytes)).rejects.toThrow('too large');
});

test('marked copy from Blobs takes the file names', async () => {
  const before = new File([elpxWithSite(OLD) as Uint8Array<ArrayBuffer>], 'old.elpx');
  const after = new File([elpxWithSite(NEW) as Uint8Array<ArrayBuffer>], 'new.elpx');
  const { diff } = await markedSite(before, after);
  expect([diff.before.name, diff.after.name]).toEqual(['old.elpx', 'new.elpx']);
  expect((await markedSite(elpxWithSite(OLD), elpxWithSite(NEW))).diff.after.name).toBe('');
});

test('a page for the viewer: self-contained, scripts included, nothing left to fetch', async () => {
  const pages: P[] = [
    { id: 'p1', title: 'Uno', blocks: [{ id: 'b1', name: '', idevices: [{ id: 'i1', html: '<p>Hola mundo</p>' }] }] },
    { id: 'p2', title: 'Dos' },
    { id: 'p3', title: 'Tres' },
  ];
  const page = `<!doctype html><html><head><title>Dos</title>
<link rel="stylesheet" href="../theme/style.css"><link rel="icon" href="../favicon.ico">
<link rel="stylesheet" href="https://cdn.example/x.css"><link rel="stylesheet" href="../missing.css"><link rel="stylesheet">
<script src="../libs/a.js" defer></script><script src='https://cdn.example/x.js'></script><script src="../libs/missing.js"></script>
<script type="module" src=../libs/m.js></script><script>var inline = 1;</script><meta http-equiv="refresh" content="0"><base href="https://evil.example/">
<style>.a{background:url(../content/resources/bg.png)}.b{background:url(https://x.example/b.png)}</style></head>
<body class="exe-export"><div class="exe-content pre-js"><nav id="siteNav"><a href="../index.html">Uno</a></nav>
<main id="p2" class="page"><div id="page-content-p2" class="page-content">
<img src="../content/resources/foto.png" srcset="../content/resources/foto.png 2x" alt="Foto">
<img src="https://x.example/y.png"><img src="../content/resources/doc.pdf"><img src="%E0%A4%A"><img src="">
<p onclick="steal()" style="background:url('../content/resources/bg.png')">Texto</p>
<p style='background:url("../content/resources/bg.png")'>Otro</p><p style="color:red">Rojo</p>
<p>Ponente only = 3, srcset = 2</p><button onmouseover=steal() type="button">B</button>
<noscript><p>Sin JavaScript</p></noscript>
<a href="../html/p3.html#x" class="next">Tres</a><a href='#arriba'>Arriba</a><a href="https://x.example/?a=1&amp;b=2" target="_self" rel="opener">Fuera</a>
<a href="mailto:a@b.c">Correo</a><a href="javascript:steal()">Mal</a><a href="../content/resources/doc.pdf">PDF</a><a name="ancla">Ancla</a>
<map><area href=../${SUMMARY_PAGE} alt="Todo"></map></div></main></div></body></html>`;
  const after = elpx(pages, {
    'index.html': '<main id="p1"><div id="i1"><p>Hola mundo</p></div></main>',
    'html/p2.html': page,
    'html/p3.html': '<body><main id="p3">Tres</main></body>',
    'theme/style.css':
      '@import url("fonts.css");@import "loop.css";@import "gone.css";body{background:url(img/bg.png)}',
    'theme/fonts.css': '@font-face{font-family:A;src:url(fonts/a.woff2) format("woff2")}',
    'theme/loop.css': '@import "loop.css";.loop{}',
    'theme/img/bg.png': 'PNG',
    'theme/fonts/a.woff2': 'WOFF',
    'content/resources/foto.png': 'FOTO',
    'content/resources/bg.png': 'BG',
    'content/resources/doc.pdf': 'PDF',
    'libs/a.js': 'var a = "</script>";',
    'libs/m.js': 'export {};',
  });
  const before = elpxWithSite([
    { id: 'p1', title: 'Uno', blocks: [{ id: 'b1', name: '', idevices: [{ id: 'i1', html: '<p>Hola</p>' }] }] },
    { id: 'p2', title: 'Dos' },
    { id: 'p3', title: 'Tres' },
    { id: 'p4', title: 'Cuatro' },
  ]);
  const project = await markProject(before, after, { lang: 'es' });
  const [one, two, three, four] = project.diff.pages;
  expect([...(await project.paths()).values()]).toEqual(['index.html', 'html/p2.html', 'html/p3.html']);
  expect(await project.page(four!, { mode: 'new' })).toBeUndefined(); // removed: no new page
  expect(await project.page(four!)).toContain('<main id="p4"'); // its changes, on its old page

  const html = (await project.page(two!))!;
  for (const gone of [
    'cdn.example',
    'missing.js',
    'http-equiv',
    '<base',
    'srcset=',
    'rel="icon"',
    'target="_self"',
    'rel="opener"',
    ' defer',
  ])
    expect(html).not.toContain(gone);
  // First of all, the viewer's own script, with the page's path; then the page's scripts, inlined in place.
  expect(html).toMatch(/^<!doctype html><html><head><script>\(function \(\) \{\n {2}var PATH = "html\/p2\.html";/);
  expect(html).toContain('<script>var a = "<\\/script>";</script>');
  expect(html).toContain('<script type="module">export {};</script>');
  expect(html).toContain('<script>var inline = 1;</script>');
  expect(html).toContain('<p onclick="steal()"'); // the page's own behaviour stays: it runs cut off
  expect(html).toContain('<noscript><p>Sin JavaScript</p></noscript>');
  expect(html).toContain(`<img src="data:image/png;base64,${btoa('FOTO')}" alt="Foto">`);
  expect(html).toContain('<img src="https://x.example/y.png">'); // outside the package: left as it is
  expect(html).toContain('<img src="../content/resources/doc.pdf">'); // not a picture: not inlined
  expect(html).toContain('<img src="%E0%A4%A">');
  expect(html).toContain(`.a{background:url("data:image/png;base64,${btoa('BG')}")}`);
  expect(html).toContain('.b{background:url(https://x.example/b.png)}');
  expect(html).toContain(`style="background:url('data:image/png;base64,${btoa('BG')}')"`);
  expect(html).toContain(`style='background:url("data:image/png;base64,${btoa('BG')}")'`);
  expect(html).toContain('<p style="color:red">Rojo</p>');
  expect(html).toContain('<p>Ponente only = 3, srcset = 2</p>'); // the text is not touched
  expect(html).toContain(`src:url("data:font/woff2;base64,${btoa('WOFF')}") format("woff2")`);
  expect(html).toContain(`body{background:url("data:image/png;base64,${btoa('PNG')}")}`);
  expect(html.match(/\.loop\{\}/g)).toHaveLength(1); // a sheet that imports itself, once
  expect(html).toContain('<body class="exe-export"><div class="exe-content pre-js">');
  // Links out open in a new tab; the rest stay as they are (the viewer's script takes them to the app).
  expect(html).toContain('<a href="../index.html">Uno</a>');
  expect(html).toContain('<a href="../html/p3.html#x" class="next">Tres</a>');
  expect(html).toContain("<a href='#arriba'>Arriba</a>");
  expect(html).toContain(
    '<a href="https://x.example/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">Fuera</a>',
  );
  expect(html).toContain('<a href="mailto:a@b.c" target="_blank" rel="noopener noreferrer">Correo</a>');
  expect(html).toContain(`<area href=../${SUMMARY_PAGE} alt="Todo">`);
  // Without <head>, the viewer's script goes first all the same.
  expect((await project.page(three!))!).toStartWith('<script>(function () {');
  // The page's own language, or the one asked for.
  expect(await project.page(one!)).toContain('<summary>Modificado</summary>');
  expect(await project.page(one!, { lang: 'en' })).toContain('<summary>Modified</summary>');
});

test('paths inside the package, seen from a page', () => {
  expect(resolvePath('html/a.html', '../content/resources/foto%201.png')).toBe('content/resources/foto 1.png');
  expect(resolvePath('index.html', 'html/b.html#top')).toBe('html/b.html');
  expect(resolvePath('theme/style.css', 'img/x.png?v=2')).toBe('theme/img/x.png');
  for (const rel of [
    '',
    '#top',
    '//cdn.example/x.css',
    'https://x.example/',
    'data:image/png;base64,AA',
    'mailto:a@b.c',
    '%E0%A4%A',
  ])
    expect(resolvePath('html/a.html', rel)).toBeUndefined();
});
