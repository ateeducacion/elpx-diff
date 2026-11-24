import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GlobalRegistrator } from '@happy-dom/global-registrator';

import { v1, v2 } from './helpers.js';

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

beforeAll(async () => {
  GlobalRegistrator.register({ url: 'http://localhost/' });
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
  expect($('save-html').textContent).toBe('Download report');
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
  $('save-html').click(); // nothing to save
  expect(saved).toHaveLength(2);
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
