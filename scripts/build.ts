#!/usr/bin/env bun
import { chmodSync, rmSync } from 'node:fs';

/** Builds dist/: the library (index.js + types), the CLI (cli.js, runs on Node) and the static web app (web/). */
import { $ } from 'bun';

rmSync('dist', { recursive: true, force: true });
// The library with its declaration files (type checked on the way).
await $`bun build src/index.ts --outdir dist --target node --format esm --packages external --dts`.quiet();
rmSync('dist/index.aot.ts');
const builds = [
  await Bun.build({
    entrypoints: ['src/bin.ts'],
    outdir: 'dist',
    naming: 'cli.js',
    target: 'node',
    format: 'esm',
    packages: 'external',
    banner: '#!/usr/bin/env node',
  }),
  await Bun.build({
    entrypoints: ['src/web/index.html'],
    outdir: 'dist/web',
    target: 'browser',
    minify: true,
    publicPath: './',
  }),
];
for (const build of builds) {
  if (!build.success) {
    for (const log of build.logs) console.error(log);
    process.exit(1);
  }
}
chmodSync('dist/cli.js', 0o755);
console.log('dist/ ready');
