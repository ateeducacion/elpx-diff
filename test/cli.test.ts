import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../src/cli.js';
import { loadProject } from '../src/model.js';
import { projectToText } from '../src/render.js';
import { v1, v2 } from './helpers.js';

const dir = mkdtempSync(join(tmpdir(), 'elpx-diff-'));
const [a, b, bad] = [join(dir, 'v1.elpx'), join(dir, 'v2.elpx'), join(dir, 'bad.elpx')];
writeFileSync(a, v1());
writeFileSync(b, v2());
writeFileSync(bad, 'not a zip');

async function run(
  argv: string[],
  env: Record<string, string> = { LANG: 'es_ES.UTF-8' },
  color = false,
): Promise<{ code: number; out: string; err: string }> {
  let [out, err] = ['', ''];
  const code = await main(argv, { stdout: (t) => void (out += t), stderr: (t) => void (err += t), env, color });
  return { code, out, err };
}

test('exit status: 0 no differences, 1 differences', async () => {
  expect(await run([a, a])).toMatchObject({ code: 0, err: '' });
  const changed = await run([a, b]);
  expect(changed.code).toBe(1);
  expect(changed.out).toStartWith('v1.elpx → v2.elpx\n+3 añadidos');
});

test('help and version', async () => {
  for (const argv of [['--help'], ['-h'], []]) {
    const help = await run(argv);
    expect(help.code).toBe(0);
    expect(help.out).toContain('Usage:\n  elpx-diff <old.elpx> <new.elpx>');
  }
  expect((await run(['--version'])).out).toMatch(/^\d+\.\d+\.\d+\n$/);
  expect((await run(['-v'])).code).toBe(0);
});

test('language: --lang, then LC_ALL, then LANG, then English', async () => {
  expect((await run([a, b], {})).out).toContain('+3 added');
  expect((await run([a, b], { LANG: 'en_GB.UTF-8', LC_ALL: 'es_ES.UTF-8' })).out).toContain('+3 añadidos');
  expect((await run([a, b, '--lang', 'en'])).out).toContain('+3 added');
  expect((await run([a, b, '--lang', 'es'], {})).out).toContain('+3 añadidos');
});

test('colours only when the terminal takes them and --no-color is not given', async () => {
  expect((await run([a, b], {}, true)).out).toContain('\x1b[32m');
  expect((await run([a, b, '--no-color'], {}, true)).out).not.toContain('\x1b[');
  expect((await run([a, b], {}, false)).out).not.toContain('\x1b[');
});

test('--json prints exactly one JSON document; --html a whole page', async () => {
  const json = await run([a, b, '--json']);
  expect(json.code).toBe(1);
  expect(JSON.parse(json.out)).toMatchObject({
    summary: { added: 3, modified: 3, removed: 2 },
    before: { name: 'v1.elpx' },
  });
  const html = await run([a, b, '--html']);
  expect(html.out).toStartWith('<!doctype html>\n<html lang="es">');
  expect(html.out).toEndWith('</html>\n');
});

test('-o writes to a file, without colours, and prints nothing', async () => {
  const target = join(dir, 'out.txt');
  expect(await run([a, b, '-o', target], {}, true)).toMatchObject({ code: 1, out: '' });
  expect(readFileSync(target, 'utf8')).toStartWith('v1.elpx → v2.elpx\n+3 added');
  const html = join(dir, 'out.html');
  await run([a, b, '--html', '--output', html]);
  expect(readFileSync(html, 'utf8')).toContain('<h1>');
});

test('textconv prints one project as text', async () => {
  const text = await run(['textconv', a]);
  expect(text).toMatchObject({ code: 0, out: projectToText(await loadProject(v1())) });
  expect((await run(['textconv', bad])).code).toBe(2);
});

test('as GIT_EXTERNAL_DIFF: seven arguments, the path as name, always status 0', async () => {
  const git = await run(['docs/curso.elpx', a, 'abc123', '100644', b, 'def456', '100644']);
  expect(git.code).toBe(0);
  expect(git.out).toStartWith('a/docs/curso.elpx → b/docs/curso.elpx\n');
});

test('errors: status 2 and one line on stderr', async () => {
  expect(await run([a, bad])).toEqual({ code: 2, out: '', err: 'elpx-diff: Not a ZIP file\n' });
  const missing = await run([a, join(dir, 'missing.elpx')]);
  expect(missing.code).toBe(2);
  expect(missing.err).toMatch(/^elpx-diff: .*(ENOENT|no such file)/i);
  expect(missing.err.trim().split('\n')).toHaveLength(1);
  expect(await run([a, dir])).toEqual({ code: 2, out: '', err: `elpx-diff: ${dir} is not a file\n` });
  const option = await run([a, b, '--nope']);
  expect(option.code).toBe(2);
  expect(option.err).toContain('--nope');
  for (const argv of [[a], [a, b, a], ['textconv']]) {
    const usage = await run(argv);
    expect(usage.code).toBe(2);
    expect(usage.err).toContain('Usage:');
  }
});

test('the process entry point: real streams and exit status', async () => {
  const bin = join(import.meta.dir, '..', 'src', 'bin.ts');
  const spawn = async (...argv: string[]): Promise<{ code: number; out: string; err: string }> => {
    const proc = Bun.spawn([process.execPath, bin, ...argv], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, LANG: 'en_GB.UTF-8', LC_ALL: '' },
    });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { code, out, err };
  };
  expect(await spawn(a, a)).toMatchObject({ code: 0, err: '' });
  const changed = await spawn(a, b);
  expect(changed.code).toBe(1);
  expect(changed.out).toContain('+3 added'); // piped: no colours
  expect(changed.out).not.toContain('\x1b[');
  expect(await spawn(a, bad)).toMatchObject({ code: 2, out: '', err: 'elpx-diff: Not a ZIP file\n' });
});
