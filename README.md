# elpx-diff

[![npm](https://img.shields.io/npm/v/elpx-diff?logo=npm)](https://www.npmjs.com/package/elpx-diff)
[![CI](https://github.com/ateeducacion/elpx-diff/actions/workflows/ci.yml/badge.svg)](https://github.com/ateeducacion/elpx-diff/actions/workflows/ci.yml)
[![GitHub Pages](https://img.shields.io/github/deployments/ateeducacion/elpx-diff/github-pages?label=web%20app&logo=github)](https://ateeducacion.github.io/elpx-diff/)
[![Coverage](https://codecov.io/gh/ateeducacion/elpx-diff/graph/badge.svg)](https://codecov.io/gh/ateeducacion/elpx-diff)

[![elpx-diff](src/web/social-card.png)](https://ateeducacion.github.io/elpx-diff/)

[Español](README.es.md)

See what changed between two versions of an [eXeLearning](https://exelearning.net) project
(`.elpx`): pages, iDevices, metadata and files, in the green and red of a normal diff.

- **Web app** — <https://ateeducacion.github.io/elpx-diff/>. Drop two files; nothing is uploaded.
- **CLI** — `npx elpx-diff old.elpx new.elpx`
- **Library** — `import { diffElpx } from 'elpx-diff'`
- **Agent Skill** — [`skills/elpx-diff`](skills/elpx-diff/SKILL.md)

It reads `content.xml` (the editable source inside the package), so it compares what the author
wrote, not the generated HTML. It reports:

- pages added, removed, renamed and moved;
- boxes and iDevices added, removed, moved and edited, with a line and word diff of their text
  (images, media and links included; game data decoded);
- project properties (title, author, licence, theme…);
- files added, removed, changed and renamed (`content/resources/`, by size and CRC-32).

Pages and iDevices are matched by id, and by title and content when a tool regenerated the ids.
Fields that change on every save (`pp_modified`, the embedded screenshot) are ignored.

## CLI

```sh
elpx-diff old.elpx new.elpx                    # coloured report in the terminal
elpx-diff old.elpx new.elpx --json             # one JSON document
elpx-diff old.elpx new.elpx --html -o diff.html  # self-contained report, no scripts
elpx-diff textconv project.elpx                # one project as plain text
```

`--lang es|en` chooses the language (default: from `LANG`); `--no-color` turns colours off. Exit
status: `0` no differences, `1` differences, `2` error.

### Git

```sh
git config diff.elpx.textconv "elpx-diff textconv"
echo "*.elpx diff=elpx" >> .gitattributes
```

`git diff`, `git log -p` and `git show` then show `.elpx` changes as text. For the full report
on one file: `GIT_EXTERNAL_DIFF=elpx-diff git diff -- project.elpx`.

## Library

```ts
import { diffElpx, renderHtml, renderReport, renderText } from 'elpx-diff';

const diff = await diffElpx(oldFile, newFile); // File, Blob or Uint8Array
diff.summary; // { added, modified, removed }
renderText(diff, { lang: 'en', color: true }); // terminal
renderHtml(diff, 'en'); // HTML fragment (project text is always escaped)
renderReport(diff, 'en'); // whole HTML page
```

Runs in browsers, Node 22.18+ and Bun. Files are read with ranged reads: only `content.xml` is
inflated, so projects with large videos compare quickly.

## Safety

Everything inside an `.elpx` is treated as untrusted data. Project HTML is read as text and never
rendered, project scripts never run, and the web app has a Content-Security-Policy that allows
no connection to other origins.

## Limits

- Legacy `.elp` projects (eXeLearning 2.x) are not supported: save them as `.elpx` first.
- No ZIP64 (archives over 4 GiB).
- The comparison is textual. Formatting-only changes are flagged as such, without detail.

## Development

```sh
bun install
bun run dev        # web app with reload
bun run cli a.elpx b.elpx
bun run check      # bun lint + bun fmt --check, bun check (types), bun test --coverage
bun run fix        # apply lint fixes and format
bun run build      # dist/: index.js + types, cli.js, web/
```

Everything runs on Bun (canary in CI): `bun lint`, `bun fmt`, `bun check`, `bun test` and
`bun build --dts`; there is no TypeScript, ESLint, Prettier or Vitest package. Tests cover every
module, the web page included (in a DOM, `test/web.test.ts`), and `bun test --coverage` fails when
a file covers under 90 % of its lines or functions. `bun.lock` stays at `lockfileVersion` 1 for
Dependabot (`bun run check:lockfile`).

`src/zip.ts` lists the archive, `src/model.ts` reads `content.xml`, `src/text.ts` turns iDevice
content into lines, `src/diff.ts` compares, `src/render.ts` and `src/report.ts` print. The web app
(`src/web`) and the HTML report share one renderer and one style sheet.

### Publishing

Every push to `main` deploys the web app to GitHub Pages (`pages.yml`). A published GitHub release
publishes the package to npm (`release.yml`, trusted publishing, when the repository variable
`NPM_PUBLISH` is `true`): bump `version` in `package.json` first, since the release tag must match it.

## Licence

The web app embeds the IBM Plex Sans and IBM Plex Mono typefaces (SIL Open Font License 1.1).

[AGPL-3.0-or-later](LICENSE). Made by the Área de Tecnología Educativa (ATE), Gobierno de Canarias.
