import { diffArrays, diffWordsWithSpace } from 'diff';

import { type Block, type Idevice, loadProject, type Page, type Project } from './model.js';

export type Status = 'added' | 'removed' | 'modified' | 'unchanged';

export interface Word {
  text: string;
  changed: boolean;
}
export interface LineDiff {
  op: ' ' | '+' | '-';
  text: string;
  /** Word-level detail when a removed line and an added line are two versions of the same text. */
  words?: Word[];
}
export interface IdeviceDiff {
  id: string;
  type: string;
  status: Status;
  moved: boolean;
  /** Same text, different markup or settings. */
  formatOnly: boolean;
  lines: LineDiff[];
}
export interface BlockDiff {
  id: string;
  name: string;
  oldName?: string;
  status: Status;
  moved: boolean;
  idevices: IdeviceDiff[];
}
export interface PageDiff {
  id: string;
  title: string;
  oldTitle?: string;
  depth: number;
  status: Status;
  moved: boolean;
  blocks: BlockDiff[];
}
export interface MetaDiff {
  key: string;
  status: Exclude<Status, 'unchanged'>;
  before?: string;
  after?: string;
}
export interface ResourceDiff {
  path: string;
  status: Exclude<Status, 'unchanged'> | 'renamed';
  oldPath?: string;
  sizeBefore?: number;
  sizeAfter?: number;
}
export interface ElpxDiff {
  before: { name: string; title: string };
  after: { name: string; title: string };
  identical: boolean;
  summary: { added: number; modified: number; removed: number };
  metadata: MetaDiff[];
  pages: PageDiff[];
  resources: ResourceDiff[];
}

function diffLines(a: string[], b: string[]): LineDiff[] {
  const out: LineDiff[] = [];
  const parts = diffArrays(a, b);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const next = parts[i + 1];
    if (part.removed && next?.added) {
      const del: LineDiff[] = part.value.map((text) => ({ op: '-', text }));
      const ins: LineDiff[] = next.value.map((text) => ({ op: '+', text }));
      for (let k = 0; k < Math.min(del.length, ins.length); k++) {
        const words = diffWordsWithSpace(del[k]!.text, ins[k]!.text);
        const common = words.reduce((n, w) => (w.added || w.removed ? n : n + w.value.length), 0);
        // Unrelated lines share only stray words: highlighting those is noise.
        if (common < 0.4 * Math.max(del[k]!.text.length, ins[k]!.text.length)) continue;
        del[k]!.words = words.filter((w) => !w.added).map((w) => ({ text: w.value, changed: w.removed }));
        ins[k]!.words = words.filter((w) => !w.removed).map((w) => ({ text: w.value, changed: w.added }));
      }
      out.push(...del, ...ins);
      i++;
    } else out.push(...part.value.map((text): LineDiff => ({ op: part.added ? '+' : part.removed ? '-' : ' ', text })));
  }
  return out;
}

interface Pair<T> {
  a?: T;
  b?: T;
  moved: boolean;
}

/**
 * Interleaves two sibling lists. An item that exists on both sides of the
 * project is shown once, where the new version has it, flagged as moved when
 * it changed place; where it used to be, it is skipped.
 */
function merge<T extends { id: string }>(a: T[], b: T[], allA: Map<string, T>, allB: Map<string, T>): Pair<T>[] {
  const out: Pair<T>[] = [];
  const ids = (list: T[]): string[] => list.map((x) => x.id);
  const byId = (list: T[]): Map<string, T> => new Map(list.map((x) => [x.id, x]));
  const [mapA, mapB] = [byId(a), byId(b)];
  for (const part of diffArrays(ids(a), ids(b))) {
    for (const id of part.value) {
      if (part.removed) {
        if (!allB.has(id)) out.push({ a: mapA.get(id)!, moved: false });
      } else if (part.added) {
        const old = allA.get(id);
        out.push(old ? { a: old, b: mapB.get(id)!, moved: true } : { b: mapB.get(id)!, moved: false });
      } else out.push({ a: mapA.get(id)!, b: mapB.get(id)!, moved: false });
    }
  }
  return out;
}

const index = <T extends { id: string }>(items: T[]): Map<string, T> => new Map(items.map((x) => [x.id, x]));
const blocksOf = (p: Project): Block[] => p.pages.flatMap((page) => page.blocks);
const idevicesOf = (p: Project): Idevice[] => blocksOf(p).flatMap((block) => block.idevices);

/**
 * Tools that regenerate ids (a merge import, a converter run twice) would make
 * everything look removed and added again. Items of the new version without a
 * match by id take the id of the old item they correspond to: pages by title,
 * blocks by name inside matched pages, iDevices by identical content and, when
 * no iDevice kept its id, by type inside matched blocks.
 */
function alignIds(a: Project, b: Project): void {
  const pair = <T extends { id: string }>(
    olds: T[],
    news: T[],
    key: (x: T) => string,
    taken: Set<string>,
    renamed?: (from: string, to: string) => void,
  ): void => {
    const free = new Map<string, T[]>();
    for (const x of olds) if (!taken.has(x.id)) free.set(key(x), [...(free.get(key(x)) ?? []), x]);
    for (const x of news) {
      if (taken.has(x.id)) continue;
      const match = free.get(key(x))?.shift();
      if (!match) continue;
      taken.add(match.id);
      renamed?.(x.id, match.id);
      x.id = match.id;
    }
  };
  const shared = (olds: { id: string }[], news: { id: string }[]): Set<string> => {
    const newIds = new Set(news.map((x) => x.id));
    return new Set(olds.map((x) => x.id).filter((id) => newIds.has(id)));
  };

  pair(
    a.pages,
    b.pages,
    (p) => p.title,
    shared(a.pages, b.pages),
    (from, to) => {
      for (const page of b.pages) if (page.parentId === from) page.parentId = to;
    },
  );
  const pagesA = index(a.pages);
  const takenBlocks = shared(blocksOf(a), blocksOf(b));
  for (const page of b.pages) pair(pagesA.get(page.id)?.blocks ?? [], page.blocks, (x) => x.name, takenBlocks);
  const takenIdevices = shared(idevicesOf(a), idevicesOf(b));
  const regenerated = takenIdevices.size === 0;
  pair(idevicesOf(a), idevicesOf(b), (x) => `${x.type}\n${x.lines.join('\n')}`, takenIdevices);
  // By type only when no iDevice kept its id: otherwise an unmatched one really is new, not an edit of another.
  if (!regenerated) return;
  const blocksA = index(blocksOf(a));
  for (const block of blocksOf(b))
    pair(blocksA.get(block.id)?.idevices ?? [], block.idevices, (x) => x.type, takenIdevices);
}

export function diffProjects(a: Project, b: Project, names: { before?: string; after?: string } = {}): ElpxDiff {
  alignIds(a, b);
  const summary = { added: 0, modified: 0, removed: 0 };
  const count = <S extends Status | 'renamed'>(status: S): S => {
    if (status !== 'unchanged') summary[status === 'renamed' ? 'modified' : (status as keyof typeof summary)]++;
    return status;
  };
  const side = <T>(x: Pair<T>): Status | undefined => (!x.a ? 'added' : !x.b ? 'removed' : undefined);
  const [pagesA, pagesB] = [index(a.pages), index(b.pages)];
  const [blocksA, blocksB] = [index(blocksOf(a)), index(blocksOf(b))];
  const [idevicesA, idevicesB] = [index(idevicesOf(a)), index(idevicesOf(b))];

  const idevice = (x: Pair<Idevice>): IdeviceDiff => {
    const lines = diffLines(x.a?.lines ?? [], x.b?.lines ?? []);
    const textChanged = lines.some((line) => line.op !== ' ');
    const formatOnly = !!x.a && !!x.b && !textChanged && x.a.raw !== x.b.raw;
    const it = (x.b ?? x.a)!;
    return {
      id: it.id,
      type: it.type,
      status: count(side(x) ?? (textChanged || formatOnly || x.moved ? 'modified' : 'unchanged')),
      moved: x.moved,
      formatOnly,
      lines,
    };
  };
  const block = (x: Pair<Block>): BlockDiff => {
    const idevices = merge(x.a?.idevices ?? [], x.b?.idevices ?? [], idevicesA, idevicesB).map(idevice);
    const renamed = !!x.a && !!x.b && x.a.name !== x.b.name;
    if (renamed || (x.moved && side(x) === undefined)) count('modified');
    const it = (x.b ?? x.a)!;
    return {
      id: it.id,
      name: it.name,
      ...(renamed ? { oldName: x.a!.name } : {}),
      status:
        side(x) ?? (renamed || x.moved || idevices.some((i) => i.status !== 'unchanged') ? 'modified' : 'unchanged'),
      moved: x.moved,
      idevices,
    };
  };
  const page = (x: Pair<Page>): PageDiff => {
    const blocks = merge(x.a?.blocks ?? [], x.b?.blocks ?? [], blocksA, blocksB).map(block);
    const renamed = !!x.a && !!x.b && x.a.title !== x.b.title;
    const moved = x.moved || (!!x.a && !!x.b && x.a.parentId !== x.b.parentId);
    const own = side(x);
    if (own) count(own);
    else if (renamed || moved) count('modified');
    const it = (x.b ?? x.a)!;
    return {
      id: it.id,
      title: it.title,
      ...(renamed ? { oldTitle: x.a!.title } : {}),
      depth: it.depth,
      status: own ?? (renamed || moved || blocks.some((k) => k.status !== 'unchanged') ? 'modified' : 'unchanged'),
      moved,
      blocks,
    };
  };
  const pages = merge(a.pages, b.pages, pagesA, pagesB).map(page);

  const metadata: MetaDiff[] = [];
  for (const key of new Set([...a.meta.keys(), ...b.meta.keys()])) {
    const [before, after] = [a.meta.get(key), b.meta.get(key)];
    if (before === after) continue;
    metadata.push({
      key,
      status: count(before === undefined ? 'added' : after === undefined ? 'removed' : 'modified'),
      ...(before === undefined ? {} : { before }),
      ...(after === undefined ? {} : { after }),
    });
  }

  const resources: ResourceDiff[] = [];
  const gone = [...a.resources].filter(([path]) => !b.resources.has(path));
  for (const [path, after] of b.resources) {
    const before = a.resources.get(path);
    if (before) {
      if (before.crc !== after.crc || before.size !== after.size) {
        resources.push({ path, status: count('modified'), sizeBefore: before.size, sizeAfter: after.size });
      }
      continue;
    }
    // Same bytes under another name: the file was renamed or moved.
    const twin = gone.findIndex(([, r]) => r.crc === after.crc && r.size === after.size);
    if (twin >= 0)
      resources.push({
        path,
        status: count('renamed'),
        oldPath: gone.splice(twin, 1)[0]![0],
        sizeBefore: after.size,
        sizeAfter: after.size,
      });
    else resources.push({ path, status: count('added'), sizeAfter: after.size });
  }
  for (const [path, before] of gone) resources.push({ path, status: count('removed'), sizeBefore: before.size });
  resources.sort((x, y) => x.path.localeCompare(y.path));

  return {
    before: { name: names.before ?? '', title: a.title },
    after: { name: names.after ?? '', title: b.title },
    identical: summary.added + summary.modified + summary.removed === 0,
    summary,
    metadata,
    pages,
    resources,
  };
}

/** Compares two .elpx files (File, Blob or bytes). Nothing is written and nothing in them is executed. */
export async function diffElpx(
  before: Blob | Uint8Array,
  after: Blob | Uint8Array,
  names: { before?: string; after?: string } = {},
): Promise<ElpxDiff> {
  const [a, b] = await Promise.all([loadProject(before), loadProject(after)]);
  const fileName = (x: Blob | Uint8Array): string | undefined =>
    'name' in x && typeof x.name === 'string' ? x.name : undefined;
  return diffProjects(a, b, { before: names.before ?? fileName(before), after: names.after ?? fileName(after) });
}
