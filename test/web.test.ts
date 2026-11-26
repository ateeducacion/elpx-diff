import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GlobalRegistrator } from '@happy-dom/global-registrator';

import { SUMMARY_PAGE } from '../src/marked.js';
import { elpxWithSite, exportedSite, type P, v1, v2 } from './helpers.js';

// The page's script runs against the real index.html in a DOM; only the browser's file picker is simulated.
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const file = (bytes: Uint8Array | string, name: string, lastModified = 0): File =>
  new File([bytes as Uint8Array<ArrayBuffer>], name, { lastModified });
/** Waits for the page to reach a state (comparisons are asynchronous). */
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
  expect(done()).toBe(true);
}

function choose(side: 'before' | 'after', ...files: File[]): void {
  const input = $<HTMLInputElement>(`file-${side}`);
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
}
function drag(side: 'before' | 'after', type: string, ...files: File[]): Event {
  const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer: { files } });
  $(`drop-${side}`).dispatchEvent(event);
  return event;
}
const stats = (): string => (document.querySelector('.stats')?.textContent ?? '').replace(/\s+/g, ' ').trim();

const saved: { name: string; blob: Blob }[] = [];
let printed = 0;
const copied: string[] = [];

beforeAll(async () => {
  // The viewer's frame starts empty (about:blank): let it be, the tests stand in for viewer.html.
  GlobalRegistrator.register({ url: 'http://localhost/', settings: { enableIframePageLoading: true } });
  const html = readFileSync(join(import.meta.dir, '..', 'src', 'web', 'index.html'), 'utf8');
  document.body.innerHTML = /<body>([\s\S]*)<script/.exec(html)![1]!;
  localStorage.setItem('lang', 'es');
  localStorage.setItem('theme', 'dark');
  let last: Blob;
  URL.createObjectURL = (blob: Blob): string => ((last = blob), 'blob:test');
  URL.revokeObjectURL = (): void => {};
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement): void {
    saved.push({ name: this.download, blob: last });
  };
  window.print = (): void => void printed++;
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async (text: string) => void copied.push(text) },
    configurable: true,
  });
  await import('../src/web/main.js');
});
afterAll(() => GlobalRegistrator.unregister());

test('starts in the stored language, waiting for the two files', () => {
  expect(document.documentElement.lang).toBe('es');
  expect($('status').textContent).toBe('Elige las dos versiones para ver los cambios.');
  expect($('drop-before').textContent).toContain('Versión anterior');
  expect($('swap').getAttribute('aria-label')).toBe('Intercambiar las dos versiones');
  expect($('lang').textContent).toBe('English');
  expect($('lang').lang).toBe('en');
  expect($('actions').hidden).toBe(true);
  expect(document.querySelector('.viewer-note')!.textContent).toStartWith('La página como la verá el lector');
  expect(saved).toEqual([]);
});

test('the theme button switches between dark and light, labels its next state and remembers the choice', () => {
  expect(document.documentElement.dataset['theme']).toBe('dark'); // the stored choice wins over the system's
  expect($('theme').getAttribute('aria-label')).toBe('Cambiar a modo claro');
  $('theme').click();
  expect(document.documentElement.dataset['theme']).toBe('light');
  expect(localStorage.getItem('theme')).toBe('light');
  expect($('theme').getAttribute('aria-label')).toBe('Cambiar a modo oscuro');
  expect($('theme').title).toBe('Cambiar a modo oscuro');
  $('theme').click();
  expect(document.documentElement.dataset['theme']).toBe('dark');
  // Without a choice, the system's scheme decides (light in this DOM).
  delete document.documentElement.dataset['theme'];
  $('theme').click();
  expect(document.documentElement.dataset['theme']).toBe('dark');
});

test('the CLI and Skill pills open their panels; commands can be copied; Close closes', async () => {
  const [cli, skill] = [$<HTMLDialogElement>('cli-panel'), $<HTMLDialogElement>('skill-panel')];
  expect(cli.open).toBe(false);
  document.querySelector<HTMLElement>('[data-open="cli-panel"]')!.click();
  expect(cli.open).toBe(true);
  expect(cli.querySelector('h2')!.textContent).toBe('Desde la terminal');
  const copy = cli.querySelector<HTMLElement>('[data-copy]')!;
  expect(copy.textContent).toBe('Copiar');
  copy.click();
  await until(() => copy.textContent === 'Copiado');
  expect(copied).toEqual(['npx elpx-diff anterior.elpx nueva.elpx']);
  cli.querySelector<HTMLElement>('[data-close]')!.click();
  expect(cli.open).toBe(false);

  document.querySelector<HTMLElement>('[data-open="skill-panel"]')!.click();
  expect(skill.open).toBe(true);
  expect(skill.textContent).toContain('npx skills add ateeducacion/elpx-diff');
  skill.querySelector<HTMLElement>('[data-close]')!.click();
  expect(skill.open).toBe(false);
});

test('the footer names the licence, links the version and opens the licences of what is bundled', () => {
  expect(document.querySelector('.licence')!.textContent).toBe('Software libre (AGPL-3.0)');
  const version = $<HTMLAnchorElement>('version');
  expect(version.textContent).toMatch(/^v\d+\.\d+\.\d+$/);
  expect(version.href).toBe(`https://github.com/ateeducacion/elpx-diff/releases/tag/${version.textContent}`);
  const panel = $<HTMLDialogElement>('licenses-panel');
  document.querySelector<HTMLElement>('[data-open="licenses-panel"]')!.click();
  expect(panel.open).toBe(true);
  expect(panel.querySelector('h2')!.textContent).toBe('Licencias y créditos');
  expect([...panel.querySelectorAll('.components span')].map((x) => x.textContent)).toEqual([
    'BSD-3-Clause',
    'BSD-2-Clause',
    'MIT',
    'OFL-1.1',
  ]);
  panel.querySelector<HTMLElement>('[data-close]')!.click();
  expect(panel.open).toBe(false);
});

test('one file is not enough; the second one starts the comparison', async () => {
  choose('before', file(v1(), 'v1.elpx'));
  expect($('drop-before').classList.contains('filled')).toBe(true);
  expect($('drop-before').querySelector('.file')!.textContent).toBe('v1.elpx');
  expect($('drop-before').querySelector('.hint')!.textContent).toBe('cambiar archivo');
  expect(document.body.classList.contains('compared')).toBe(false);
  expect($('status').textContent).toBe('Elige las dos versiones para ver los cambios.');
  expect($<HTMLInputElement>('file-before').value).toBe(''); // the same file can be chosen again

  choose('after', file(v2(), 'v2.elpx'));
  await until(() => stats() !== '');
  expect(stats()).toBe('+3 Añadidos 3 Modificados −2 Eliminados');
  expect($('status').textContent).toBe('Comparación lista: 3 añadidos, 3 modificados, 2 eliminados.');
  expect($('status').getAttribute('role')).toBe('status');
  expect([...document.querySelectorAll('.compare span')].map((s) => s.textContent)).toEqual(['v1.elpx', 'v2.elpx']);
  expect($('actions').hidden).toBe(false);
  expect(document.body.classList.contains('compared')).toBe(true); // the opening question gives way to the result
  expect($('result').querySelector('ins mark')!.textContent).toBe('Canarias');
});

test('the language button translates the page and the result, and remembers it', () => {
  $('lang').click();
  expect(document.documentElement.lang).toBe('en');
  expect(localStorage.getItem('lang')).toBe('en');
  expect(stats()).toBe('+3 Added 3 Modified −2 Removed');
  expect($('status').textContent).toBe('Comparison ready: 3 added, 3 modified, 2 removed.');
  expect($('lang').textContent).toBe('Español');
  expect($('save-html').textContent).toBe('Download HTML');
  expect(document.querySelector('.viewer-note')!.textContent).toStartWith('The page as readers will see it');
  expect($('print').textContent).toBe('Print / PDF');
  $('lang').click();
  expect(stats()).toBe('+3 Añadidos 3 Modificados −2 Eliminados');
});

test('swap compares the other way round', async () => {
  $('swap').click();
  await until(() => stats().startsWith('+2'));
  expect(stats()).toBe('+2 Añadidos 3 Modificados −3 Eliminados');
  expect($('drop-before').querySelector('.file')!.textContent).toBe('v2.elpx');
  $('swap').click();
  await until(() => stats().startsWith('+3'));
});

test('"only changes" marks the result so unchanged items are hidden', () => {
  const box = $<HTMLInputElement>('only-changes');
  box.checked = true;
  box.dispatchEvent(new Event('change'));
  expect($('result').classList.contains('only-changes')).toBe(true);
  box.checked = false;
  box.dispatchEvent(new Event('change'));
  expect($('result').classList.contains('only-changes')).toBe(false);
});

test('the index folds away and stays folded across re-renders', () => {
  const toc = (): HTMLDetailsElement => $('result').querySelector<HTMLDetailsElement>('.toc details')!;
  expect(toc().open).toBe(true);
  toc().open = false;
  toc().dispatchEvent(new Event('toggle'));
  expect(localStorage.getItem('toc')).toBe('closed');
  $('lang').click();
  $('lang').click();
  expect(toc().open).toBe(false);
  toc().open = true;
  toc().dispatchEvent(new Event('toggle'));
  expect(localStorage.getItem('toc')).toBe('open');
  $('result').querySelector('details.page')!.dispatchEvent(new Event('toggle')); // other folds are not the index
  expect(localStorage.getItem('toc')).toBe('open');
});

test('"side by side" shows edits in two columns, remembers it, and the report follows', async () => {
  expect($('print').textContent).toBe('Imprimir / PDF');
  expect(document.querySelector('[data-t="sideBySide"]')!.textContent).toBe('Dos columnas');
  expect($('save-html').textContent).toBe('Descargar HTML');
  const box = $<HTMLInputElement>('side-by-side');
  box.checked = true;
  box.dispatchEvent(new Event('change'));
  expect(localStorage.getItem('view')).toBe('split');
  expect($('result').querySelector('table.split td.ins mark')!.textContent).toBe('Canarias');
  $('save-html').click();
  expect(await saved.pop()!.blob.text()).toContain('<table class="split">');
  box.checked = false;
  box.dispatchEvent(new Event('change'));
  expect(localStorage.getItem('view')).toBe('inline');
  expect($('result').querySelector('table.split')).toBeNull();
});

test('downloads: the HTML report and the JSON data; print opens every page', async () => {
  $('save-html').click();
  $('save-json').click();
  expect(saved.map((s) => [s.name, s.blob.type])).toEqual([
    ['elpx-diff.html', 'text/html'],
    ['elpx-diff.json', 'application/json'],
  ]);
  expect(await saved[0]!.blob.text()).toStartWith('<!doctype html>\n<html lang="es">');
  expect(JSON.parse(await saved[1]!.blob.text()).summary).toEqual({ added: 3, modified: 3, removed: 2 });

  for (const d of $('result').querySelectorAll('details')) d.open = false;
  $('print').click();
  expect(printed).toBe(1);
  expect([...$('result').querySelectorAll('details')].every((d) => d.open)).toBe(true);
});

test('each page of the result opens marked in the viewer, its scripts cut off from the app', async () => {
  const pages: P[] = [
    { id: 'p', title: 'Primera', blocks: [{ id: 'b', name: '', idevices: [{ id: 'i', html: '<p>Hola</p>' }] }] },
    { id: 'q', title: 'Segunda' },
  ];
  const newer = structuredClone(pages);
  newer[0]!.blocks![0]!.idevices[0]!.html = '<p>Hola mundo</p>';
  choose('before', file(elpxWithSite(pages), 'antes.elpx'));
  choose('after', file(elpxWithSite(newer), 'despues.elpx'));
  await until(() => document.querySelectorAll('.view-page').length === 2);
  const button = document.querySelector<HTMLButtonElement>('#page-0 .view-page')!;
  expect(button.textContent).toBe('Ver con su diseño →');
  expect(button.parentElement!.textContent).toBe('iDevices: 1 modificado · Ver con su diseño →'); // at the end of the counts
  expect(button.title).toBe(
    'Muestra la página con el diseño, el menú y las imágenes del proyecto, y los cambios marcados',
  );

  // Scripts, but no allow-same-origin: an origin of its own, apart from the app.
  const frame = $<HTMLIFrameElement>('viewer-frame');
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
  // The browser would load viewer.html; here the load is announced by hand and the message caught.
  const posted: { type: string; html: string }[] = [];
  const inner = { postMessage: (message: { type: string; html: string }) => void posted.push(message) };
  Object.defineProperty(frame, 'contentWindow', { value: inner, configurable: true });
  let src = '';
  Object.defineProperty(frame, 'src', { get: () => src, set: (url: string) => void (src = url), configurable: true });
  const loaded = async (): Promise<void> => {
    await until(() => frame.onload !== null);
    expect(frame.src).toMatch(/viewer\.html\?\d+$/);
    frame.onload!(new Event('load'));
  };

  const opened = button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(opened).toBe(false); // the page in the result does not fold
  expect($<HTMLDialogElement>('viewer').open).toBe(true);
  expect($('viewer-title').textContent).toBe('Primera · cambios');
  await loaded();
  await until(() => posted.length === 1);
  expect(posted[0]!.type).toBe('elpx-diff-page');
  expect(posted[0]!.html).toContain('Hola<ins> mundo</ins>');
  expect(posted[0]!.html).toContain("parent.postMessage({ type: 'elpx-diff-open'");

  // A link to another page, clicked in the frame, comes as a message; only the frame's are heard.
  const say = (data: unknown, source: unknown = inner): void => {
    window.dispatchEvent(new MessageEvent('message', { data, source: source as Window }));
  };
  say({ type: 'elpx-diff-open', path: 'html/q.html' }, window); // not from the frame
  say(null);
  say({ type: 'other', path: 'html/q.html' });
  say({ type: 'elpx-diff-open', path: 42 });
  say({ type: 'elpx-diff-open', path: 'html/zzz.html' }); // no such page
  expect($('viewer-title').textContent).toBe('Primera · cambios');
  say({ type: 'elpx-diff-open', path: 'html/q.html' });
  expect($('viewer-title').textContent).toBe('Segunda · cambios');
  await loaded();
  await until(() => posted.length === 2);
  expect(posted[1]!.html).toContain('<main id="q"');
  // A late load, after the page is shown, is the page's own doing: nothing is posted again.
  say({ type: 'elpx-diff-open', path: 'index.html' });
  say({ type: 'elpx-diff-open', path: 'html/q.html' }); // a newer one before the first loaded
  await loaded();
  await until(() => posted.length === 3);
  expect(posted[2]!.html).toContain('<main id="q"');
  // The bar's switch: the same page another way, at the iDevice in sight; nonsense is ignored.
  say({ type: 'elpx-diff-mode', mode: 'sideways' });
  say({ type: 'elpx-diff-mode', mode: 'old', anchor: 42 });
  expect($('viewer-title').textContent).toBe('Segunda · versión anterior');
  await loaded();
  await until(() => posted.length === 4);
  expect(posted[3]!.html).toContain('var ANCHOR = "";');
  expect(posted[3]!.html).toContain("classList.add('elpx-diff-off')"); // as it is, no marks
  say({ type: 'elpx-diff-mode', mode: 'new', anchor: 'idevice-x' });
  expect($('viewer-title').textContent).toBe('Segunda · versión nueva');
  await loaded();
  await until(() => posted.length === 5);
  expect(posted[4]!.html).toContain('var ANCHOR = "idevice-x";');
  say({ type: 'elpx-diff-open', path: SUMMARY_PAGE }); // "all the pages with changes": back to the result
  expect($<HTMLDialogElement>('viewer').open).toBe(false);
  // Closing stops the page, and a closed viewer hears nothing from it: it does not open again by itself.
  expect(frame.src).toBe('about:blank');
  say({ type: 'elpx-diff-mode', mode: 'old' });
  say({ type: 'elpx-diff-open', path: 'html/q.html' });
  expect($<HTMLDialogElement>('viewer').open).toBe(false);

  // A page the new version removed opens in its old version; it has no new one to switch to.
  choose('before', file(elpxWithSite([...pages, { id: 'r', title: 'Tercera' }]), 'antes.elpx'));
  await until(() => document.querySelectorAll('.view-page').length === 3);
  document.querySelector<HTMLButtonElement>('details.page.removed .view-page')!.click();
  expect($('viewer-title').textContent).toBe('Tercera · cambios');
  await loaded();
  await until(() => posted.length === 6);
  expect(posted[5]!.html).toContain('<main id="r"');
  say({ type: 'elpx-diff-mode', mode: 'new' }); // it has none: the changes it is
  expect($('viewer-title').textContent).toBe('Tercera · cambios');
  say({ type: 'elpx-diff-mode', mode: 'old' });
  expect($('viewer-title').textContent).toBe('Tercera · versión anterior');
  // Links in the old version lead to old pages, shown the same way.
  say({ type: 'elpx-diff-open', path: 'index.html' });
  expect($('viewer-title').textContent).toBe('Primera · versión anterior');
  await loaded(); // only the last of these three asks gets its page
  await until(() => posted.length === 7);
  expect(posted[6]!.html).toContain("classList.add('elpx-diff-off')");
  $<HTMLDialogElement>('viewer').close();
  choose('before', file(elpxWithSite(pages), 'antes.elpx'));
  await until(() => document.querySelectorAll('.view-page').length === 2);

  // A page that cannot be put together (its style sheet is compressed in a way nobody reads): said in the frame.
  const site = exportedSite(newer);
  const broken = elpxWithSite(newer, {
    'index.html': site['index.html']!.replace('<head>', '<head><link rel="stylesheet" href="theme/style.css">'),
    'theme/style.css': 'body{}',
  });
  const view = new DataView(broken.buffer, broken.byteOffset, broken.byteLength);
  const name = new TextEncoder().encode('theme/style.css');
  for (let p = 0; p + 46 + name.length <= broken.length; p++)
    if (view.getUint32(p, true) === 0x02014b50 && name.every((c, k) => broken[p + 46 + k] === c))
      view.setUint16(p + 10, 99, true); // compression method
  choose('after', file(broken, 'rota.elpx'));
  await until(() => document.querySelectorAll('.view-page').length === 2);
  document.querySelector<HTMLButtonElement>('#page-0 .view-page')!.click();
  await loaded();
  await until(() => posted.length === 8);
  expect(posted[7]!.html).toContain('No se ha podido mostrar la página: ');
  expect(posted[7]!.html).toContain('unsupported compression method');
  $<HTMLDialogElement>('viewer').close();
  delete (frame as unknown as Record<string, unknown>)['contentWindow'];
  delete (frame as unknown as Record<string, unknown>)['src'];

  // Full screen: the button asks for it and offers to leave it; closing the viewer leaves it too.
  const full = $('viewer-full');
  expect(full.textContent).toBe('Pantalla completa');
  let [asked, left] = [0, 0];
  document.documentElement.requestFullscreen = async (): Promise<void> => void asked++;
  document.exitFullscreen = async (): Promise<void> => void left++;
  full.click();
  expect(asked).toBe(1);
  Object.defineProperty(document, 'fullscreenElement', { value: document.documentElement, configurable: true });
  document.dispatchEvent(new Event('fullscreenchange'));
  expect(full.textContent).toBe('Salir de pantalla completa');
  full.click();
  expect(left).toBe(1);
  $<HTMLDialogElement>('viewer').showModal();
  $<HTMLDialogElement>('viewer').close();
  expect(left).toBe(2);
  delete (document as unknown as Record<string, unknown>)['fullscreenElement'];
  document.dispatchEvent(new Event('fullscreenchange'));
  expect(full.textContent).toBe('Pantalla completa');

  choose('before', file(v1(), 'v1.elpx'));
  choose('after', file(v2(), 'v2.elpx'));
  await until(() => !$('actions').hidden);
  expect(document.querySelectorAll('.view-page')).toHaveLength(0); // no exported website, no button
});

test('dropping: highlights the zone, takes the file, and never lets the browser open it', async () => {
  expect(drag('after', 'dragenter').defaultPrevented).toBe(true);
  expect($('drop-after').classList.contains('over')).toBe(true);
  drag('after', 'dragleave');
  expect($('drop-after').classList.contains('over')).toBe(false);
  drag('after', 'dragover');
  drag('after', 'drop', file(v1(), 'otra.elpx'));
  expect($('drop-after').classList.contains('over')).toBe(false);
  await until(() => stats().startsWith('+0'));
  expect($('status').textContent).toBe('Comparación lista: 0 añadidos, 0 modificados, 0 eliminados.');
  expect($('result').querySelector('.identical')).not.toBeNull();

  const stray = new Event('drop', { cancelable: true });
  window.dispatchEvent(stray);
  expect(stray.defaultPrevented).toBe(true);
  drag('after', 'drop'); // nothing dropped: nothing changes
  expect($('drop-after').querySelector('.file')!.textContent).toBe('otra.elpx');
});

test('two files at once fill both sides, older first', async () => {
  choose('before', file(v2(), 'nueva.elpx', 2000), file(v1(), 'vieja.elpx', 1000));
  await until(() => stats().startsWith('+3'));
  expect([...document.querySelectorAll('.compare span')].map((s) => s.textContent)).toEqual([
    'vieja.elpx',
    'nueva.elpx',
  ]);
});

test('a file that is not a project: the error is announced and the old result is gone', async () => {
  choose('after', file('not a zip', 'notas.txt'));
  await until(() => $('status').classList.contains('error'));
  expect($('status').textContent).toBe('No se ha podido comparar: Not a ZIP file');
  expect($('status').getAttribute('role')).toBe('alert');
  expect($('result').children).toHaveLength(0);
  expect($('actions').hidden).toBe(true);
  const count = saved.length;
  $('save-html').click(); // nothing to save
  expect(saved).toHaveLength(count);
  $('lang').click(); // the error stays while the page is translated
  expect($('status').classList.contains('error')).toBe(true);
  $('lang').click();
});

test('a late result never replaces a newer one', async () => {
  choose('after', file(v2(), 'v2.elpx'));
  await until(() => stats() !== '');
  // Start a comparison and replace it at once: only the last one may be shown.
  choose('after', file(v1(), 'lenta.elpx'));
  choose('after', file(v2(), 'final.elpx'));
  await until(() => document.querySelectorAll('.compare span')[1]?.textContent === 'final.elpx');
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(document.querySelectorAll('.compare span')[1]!.textContent).toBe('final.elpx');
});
