import { openAsBlob, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';

import pkg from '../package.json' with { type: 'json' };
import { diffElpx, ElpxError, type Lang, loadProject, projectToText, renderReport, renderText } from './index.js';

const HELP = `elpx-diff ${pkg.version} — compare two eXeLearning projects (.elpx)

Usage:
  elpx-diff <old.elpx> <new.elpx> [options]   show what changed
  elpx-diff textconv <file.elpx>              print a project as plain text (for git)

Options:
  --json             the comparison as one JSON document
  --html             the comparison as a self-contained HTML report
  -o, --output FILE  write to FILE instead of standard output
  --lang es|en       language of the output (default: from LANG)
  --no-color         plain text without colours
  -h, --help         this help
  -v, --version      version

Exit status: 0 no differences, 1 differences, 2 error.

Git:
  git config diff.elpx.textconv "elpx-diff textconv"
  echo "*.elpx diff=elpx" >> .gitattributes
`;

/** Bun opens a missing file as an empty Blob; stat first, so a wrong path is reported as such in every runtime. */
function open(path: string): Promise<Blob> {
  if (!statSync(path).isFile()) throw new ElpxError(`${path} is not a file`);
  return openAsBlob(path);
}

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
  env: Record<string, string | undefined>;
  color: boolean;
}

export async function main(argv: string[], io: Io): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        json: { type: 'boolean' },
        html: { type: 'boolean' },
        output: { type: 'string', short: 'o' },
        lang: { type: 'string' },
        'no-color': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
    if (values.version) return (io.stdout(`${pkg.version}\n`), 0);
    if (values.help || positionals.length === 0) return (io.stdout(HELP), 0);
    const emit = (text: string): void => (values.output ? writeFileSync(values.output, text) : io.stdout(text));

    if (positionals[0] === 'textconv' && positionals.length === 2) {
      emit(projectToText(await loadProject(await open(positionals[1]!))));
      return 0;
    }
    // As GIT_EXTERNAL_DIFF git passes: path old-file old-hex old-mode new-file new-hex new-mode.
    const external = positionals.length === 7;
    const [before, after] = external ? [positionals[1]!, positionals[4]!] : positionals;
    if (!before || !after || (!external && positionals.length !== 2)) return (io.stderr(HELP), 2);
    const lang: Lang = (values.lang ?? io.env['LC_ALL'] ?? io.env['LANG'] ?? '').startsWith('es') ? 'es' : 'en';
    const names = external
      ? { before: `a/${positionals[0]}`, after: `b/${positionals[0]}` }
      : { before: basename(before), after: basename(after) };
    const diff = await diffElpx(await open(before), await open(after), names);
    emit(
      values.json
        ? `${JSON.stringify(diff, null, 2)}\n`
        : values.html
          ? renderReport(diff, lang)
          : renderText(diff, { lang, color: io.color && !values['no-color'] && !values.output }),
    );
    return external || diff.identical ? 0 : 1;
  } catch (error) {
    // Bad input and bad arguments are the user's to fix; anything else is a bug and keeps its stack.
    const expected = error instanceof ElpxError || (error instanceof Error && 'code' in error);
    io.stderr(
      `elpx-diff: ${expected ? (error as Error).message : error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    return 2;
  }
}
