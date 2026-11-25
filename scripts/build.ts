#!/usr/bin/env bun
import { chmodSync, copyFileSync, rmSync } from 'node:fs';

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
// og:image is an absolute URL the bundler does not follow: the card keeps its name next to the page.
copyFileSync('src/web/social-card.png', 'dist/web/social-card.png');
// The viewer's frame is a page of its own, with its own policy, loaded by URL: it is copied as it is.
copyFileSync('src/web/viewer.html', 'dist/web/viewer.html');
console.log('dist/ ready');
