#!/usr/bin/env bun
/**
 * The web app while it is worked on: index.html bundled as it changes, and next to it what the build
 * copies as it is (the viewer's frame, a page with a policy of its own, and the example).
 */
import index from '../src/web/index.html';

const asIs = (request: Request): Response => new Response(Bun.file(`src/web${new URL(request.url).pathname}`));
const server = Bun.serve({
  development: true,
  routes: { '/': index, '/viewer.html': asIs, '/examples/*': asIs },
});
console.log(String(server.url));
