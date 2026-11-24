import { expect, test } from 'bun:test';

import { diffElpx, diffProjects } from '../src/diff.js';
import { loadProject } from '../src/model.js';
import { elpx, type P, single, v1, v2 } from './helpers.js';

test('reports added, modified and removed content, metadata and files', async () => {
  const diff = await diffElpx(v1(), v2(), { before: 'v1.elpx', after: 'v2.elpx' });
  expect(diff.before).toEqual({ name: 'v1.elpx', title: 'Recurso' });
  expect(diff.identical).toBe(false);
  const [p1, p2] = diff.pages;
  expect(p1!.status).toBe('modified');
  expect(p1!.blocks.map((b) => b.status)).toEqual(['unchanged', 'modified']);
  expect(p1!.blocks[1]!.idevices.map((i) => `${i.id}:${i.status}`)).toEqual(['i2:modified', 'i3:removed', 'i4:added']);
  expect(p2).toMatchObject({ status: 'modified', title: 'Unidad dos', oldTitle: 'Unidad 2', moved: false });
  expect(diff.metadata).toEqual([{ key: 'pp_author', status: 'added', after: 'ATE' }]);
  expect(diff.resources.map((r) => `${r.status} ${r.oldPath ?? ''}>${r.path}`)).toEqual([
    'added >content/resources/intro.mp4',
    'renamed content/resources/guia.pdf>content/resources/manual.pdf',
    'removed >content/resources/mapa.png',
  ]);
  expect(diff.summary).toEqual({ added: 3, modified: 3, removed: 2 });
});

test('edited lines carry the words that changed; unrelated lines do not', async () => {
  const lines = (await diffElpx(v1(), v2())).pages[0]!.blocks[1]!.idevices[0]!.lines;
  expect(lines.map((l) => l.op).join('')).toBe('-+ ');
  expect(lines[0]!.words!.filter((w) => w.changed).map((w) => w.text)).toEqual(['España']);
  expect(lines[1]!.words!.filter((w) => w.changed).map((w) => w.text)).toEqual(['Canarias']);
  expect(lines[0]!.words!.map((w) => w.text).join('')).toBe(lines[0]!.text);

  const rewritten = await diffElpx(
    single('<p>Uno dos tres</p><p>fin</p>'),
    single('<p>Completamente distinto y nuevo</p><p>otra más</p><p>fin</p>'),
  );
  const ops = rewritten.pages[0]!.blocks[0]!.idevices[0]!.lines;
  expect(ops.map((l) => l.op).join('')).toBe('-++ ');
  expect(ops.every((l) => l.words === undefined)).toBe(true);
});

test('identical projects', async () => {
  const diff = await diffElpx(v1(), v1());
  expect(diff).toMatchObject({
    identical: true,
    summary: { added: 0, modified: 0, removed: 0 },
    metadata: [],
    resources: [],
  });
  expect(diff.pages.every((p) => p.status === 'unchanged' && !p.moved)).toBe(true);
});

test('names come from the arguments, then from the files', async () => {
  const file = (name: string): File => new File([v1() as Uint8Array<ArrayBuffer>], name);
  expect((await diffElpx(file('a.elpx'), file('b.elpx'))).after.name).toBe('b.elpx');
  expect((await diffElpx(file('a.elpx'), file('b.elpx'), { after: 'nueva' })).after.name).toBe('nueva');
  expect((await diffElpx(v1(), v1())).before.name).toBe('');
});

test('same text with other markup or settings is flagged as a format change', async () => {
  const diff = await diffElpx(single('<p>Hola</p>'), single('<p><strong>Hola</strong></p>'));
  expect(diff.pages[0]!.blocks[0]!.idevices[0]).toMatchObject({ status: 'modified', formatOnly: true });
  expect(diff.summary.modified).toBe(1);
});

test('metadata added, changed and removed', async () => {
  const page: P[] = [{ id: 'p', title: 'P' }];
  const diff = await diffElpx(
    elpx(page, {}, { pp_title: 'A', pp_lang: 'es' }),
    elpx(page, {}, { pp_title: 'B', pp_author: 'ATE' }),
  );
  expect(diff.metadata).toEqual([
    { key: 'pp_title', status: 'modified', before: 'A', after: 'B' },
    { key: 'pp_lang', status: 'removed', before: 'es' },
    { key: 'pp_author', status: 'added', after: 'ATE' },
  ]);
  expect(diff.before.title).toBe('A');
});

test('files: changed content, and only one twin taken per rename', async () => {
  const page: P[] = [{ id: 'p', title: 'P' }];
  const a = elpx(page, {
    'content/resources/a.txt': 'uno',
    'content/resources/b.txt': 'igual',
    'content/resources/c.txt': 'igual',
  });
  const b = elpx(page, { 'content/resources/a.txt': 'dos!', 'content/resources/z.txt': 'igual' });
  expect((await diffElpx(a, b)).resources).toEqual([
    { path: 'content/resources/a.txt', status: 'modified', sizeBefore: 3, sizeAfter: 4 },
    { path: 'content/resources/c.txt', status: 'removed', sizeBefore: 5 },
    {
      path: 'content/resources/z.txt',
      status: 'renamed',
      oldPath: 'content/resources/b.txt',
      sizeBefore: 5,
      sizeAfter: 5,
    },
  ]);
});

test('pages: added, removed, reordered and moved under another parent', async () => {
  const pages = (...list: [string, string?][]): P[] =>
    list.map(([id, parent]) => ({ id, title: id.toUpperCase(), ...(parent ? { parent } : {}) }));
  const added = await diffElpx(elpx(pages(['a'])), elpx(pages(['a'], ['b'])));
  expect(added.pages.map((p) => p.status)).toEqual(['unchanged', 'added']);
  const removed = await diffElpx(elpx(pages(['a'], ['b'])), elpx(pages(['a'])));
  expect(removed.pages.map((p) => `${p.id}:${p.status}`)).toEqual(['a:unchanged', 'b:removed']);
  expect(removed.summary).toEqual({ added: 0, modified: 0, removed: 1 });

  const reordered = await diffElpx(elpx(pages(['a'], ['b'], ['c'])), elpx(pages(['c'], ['a'], ['b'])));
  expect(reordered.pages.map((p) => `${p.id}:${p.moved}`)).toEqual(['c:true', 'a:false', 'b:false']);
  expect(reordered.summary).toEqual({ added: 0, modified: 1, removed: 0 });

  const nested = await diffElpx(elpx(pages(['a'], ['b'])), elpx(pages(['a'], ['b', 'a'])));
  expect(nested.pages[1]).toMatchObject({ id: 'b', depth: 1, moved: true, status: 'modified' });
});

test('boxes: renamed, and moved to another page with their iDevices', async () => {
  const box = (name: string): NonNullable<P['blocks']> => [
    { id: 'b', name, idevices: [{ id: 'i', html: '<p>Hola</p>' }] },
  ];
  const renamed = await diffElpx(
    elpx([{ id: 'p', title: 'P', blocks: box('Antes') }]),
    elpx([{ id: 'p', title: 'P', blocks: box('Después') }]),
  );
  expect(renamed.pages[0]!.blocks[0]).toMatchObject({ name: 'Después', oldName: 'Antes', status: 'modified' });
  expect(renamed.summary.modified).toBe(1);

  const moved = await diffElpx(
    elpx([
      { id: 'p1', title: 'P1', blocks: box('Caja') },
      { id: 'p2', title: 'P2' },
    ]),
    elpx([
      { id: 'p1', title: 'P1' },
      { id: 'p2', title: 'P2', blocks: box('Caja') },
    ]),
  );
  expect(moved.pages[0]!.blocks).toEqual([]); // shown once, where it is now
  expect(moved.pages[1]!.blocks[0]).toMatchObject({ moved: true, status: 'modified' });
  expect(moved.pages[1]!.blocks[0]!.idevices[0]!.status).toBe('unchanged');
  expect(moved.summary).toEqual({ added: 0, modified: 1, removed: 0 });
});

test('an iDevice that goes to another page is one moved item', async () => {
  const at = (first: boolean): P[] =>
    ['p1', 'p2'].map((id, n) => ({
      id,
      title: id,
      blocks: [{ id: `b${n}`, name: '', idevices: first === (n === 0) ? [{ id: 'i', html: '<p>Viajo</p>' }] : [] }],
    }));
  const moved = await diffElpx(elpx(at(true)), elpx(at(false)));
  expect(moved.summary).toEqual({ added: 0, modified: 1, removed: 0 });
  expect(moved.pages[1]!.blocks[0]!.idevices[0]).toMatchObject({ moved: true, status: 'modified', formatOnly: false });
});

test('regenerated ids: matched by title, name, content and, failing that, type', async () => {
  const page = (ids: string[], extra = ''): P[] => [
    {
      id: ids[0]!,
      title: 'Inicio',
      blocks: [{ id: ids[1]!, name: 'Bloque', idevices: [{ id: ids[2]!, html: `<p>Hola${extra}</p>` }] }],
    },
    { id: ids[3]!, title: 'Hija', parent: ids[0]! },
  ];
  expect((await diffElpx(elpx(page(['a', 'b', 'c', 'd'])), elpx(page(['w', 'x', 'y', 'z'])))).identical).toBe(true);
  const edited = await diffElpx(elpx(page(['a', 'b', 'c', 'd'])), elpx(page(['w', 'x', 'y', 'z'], ' mundo')));
  expect(edited.summary).toEqual({ added: 0, modified: 1, removed: 0 });
  expect(edited.pages[1]!.moved).toBe(false); // the child follows its parent's new id
});

test('with ids kept, a new iDevice of the same type is new, not an edit of a removed one', async () => {
  const diff = await diffElpx(v1(), v2());
  expect(diff.pages[0]!.blocks[1]!.idevices.map((i) => i.status)).toEqual(['modified', 'removed', 'added']);
});

test('diffProjects compares projects that are already loaded', async () => {
  const diff = diffProjects(await loadProject(v1()), await loadProject(v2()));
  expect(diff.summary).toEqual({ added: 3, modified: 3, removed: 2 });
  expect(diff.before.name).toBe('');
});
