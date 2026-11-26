#!/usr/bin/env bun
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';

/** Builds dist/: the library (index.js + types), the CLI (cli.js, runs on Node) and the static web app (web/). */
import { $ } from 'bun';
import { unzipSync, zipSync } from 'fflate';

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
// The app's example, two versions of eXeLearning's manual: too big for the repository, so they are fetched
// here (once: .cache/ keeps them) and served by the site itself, which connects to no other origin.
const MANUAL_3 =
  'https://raw.githubusercontent.com/exelearning/exelearning/v4.0.6/test/fixtures/Manual%20de%20eXeLearning%203.0.elpx';
const MANUAL_4 = 'https://github.com/exelearning/exelearning-manual-es/releases/latest/download/exelearning-manual-es';
mkdirSync('.cache/examples', { recursive: true });
mkdirSync('dist/web/examples');
const cached = async (name: string, url: string): Promise<string> => {
  const path = `.cache/examples/${name}`;
  if (!existsSync(path)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    await Bun.write(path, response);
  }
  return path;
};
try {
  copyFileSync(await cached('manual-3.elpx', MANUAL_3), 'dist/web/examples/manual-3.elpx');
  // Version 4's manual is published without its pages, and its website apart: together they are the project
  // as eXeLearning saves it, pages included, which is what lets them be seen with their design.
  const whole = '.cache/examples/manual-4.elpx';
  if (!existsSync(whole)) {
    const [project, site] = await Promise.all(
      [cached('manual-4-project.elpx', `${MANUAL_4}.elpx`), cached('manual-4-site.zip', `${MANUAL_4}-html.zip`)].map(
        async (path) => unzipSync(await Bun.file(await path).bytes()),
      ),
    );
    await Bun.write(whole, zipSync({ ...site, ...project }));
  }
  copyFileSync(whole, 'dist/web/examples/manual-4.elpx');
} catch (error) {
  // Without them the site still works; only its example button will say it could not be loaded.
  console.warn(`examples not included: ${error instanceof Error ? error.message : error}`);
}
console.log('dist/ ready');
