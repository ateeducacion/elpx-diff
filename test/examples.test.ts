import { expect, test } from 'bun:test';

import { diffElpx, markProject } from '../src/index.js';

// The web app's example (scripts/examples.ts): what it is meant to show is there, in both languages.
test.each(['ciclo-del-agua', 'water-cycle'])(
  'the example %s shows every kind of change, with its pages',
  async (name) => {
    const [before, after] = await Promise.all(
      [1, 2].map((version) => Bun.file(`src/web/examples/${name}-v${version}.elpx`).bytes()),
    );
    const diff = await diffElpx(before!, after!);
    const pages = (status: string): number => diff.pages.filter((page) => page.status === status).length;
    expect([pages('added'), pages('removed'), pages('unchanged')]).toEqual([1, 1, 3]);
    expect(diff.pages.some((page) => page.oldTitle)).toBe(true);
    expect(diff.metadata.map((one) => one.key)).toEqual(['pp_title', 'pp_description']);
    expect(diff.resources.map((one) => `${one.status} ${one.path}`)).toEqual([
      'added content/resources/aquifer.svg',
      'modified content/resources/water-cycle.svg',
    ]);

    // Every page of both versions can be seen with its design.
    const marked = await markProject(before!, after!);
    const [older, newer] = await Promise.all([marked.paths('old'), marked.paths('new')]);
    expect([older.size, newer.size]).toEqual([14, 14]);
  },
);
