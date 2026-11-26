import pkg from '../../package.json' with { type: 'json' };
import { type ElpxDiff, type PageDiff, pageTally } from '../diff.js';
import { type Lang, strings } from '../i18n.js';
import { type MarkedProject, markProject, type Mode, type Side, SUMMARY_PAGE } from '../marked.js';
import { renderHtml } from '../render.js';
import { renderReport } from '../report.js';

const UI = {
  es: {
    tagline: 'Comparador de proyectos eXeLearning. Los archivos no salen de tu equipo.',
    question: '¿Qué ha cambiado entre dos versiones de tu proyecto?',
    lead: 'Elige dos archivos .elpx y verás, página a página, el texto añadido en verde y el eliminado en rojo. Todo ocurre en tu navegador: no se sube nada.',
    before: 'Versión anterior',
    after: 'Versión nueva',
    choose: 'Elige un archivo .elpx',
    hint: 'o arrástralo aquí',
    change: 'cambiar archivo',
    swap: 'Intercambiar las dos versiones',
    themeDark: 'Cambiar a modo oscuro',
    themeLight: 'Cambiar a modo claro',
    comparing: 'Comparando…',
    waiting: 'Elige las dos versiones para ver los cambios.',
    done: (a: number, m: number, r: number) => `Comparación lista: ${a} añadidos, ${m} modificados, ${r} eliminados.`,
    error: 'No se ha podido comparar: ',
    saveHtml: 'Descargar HTML',
    saveJson: 'JSON',
    example: 'Probar con un ejemplo: el manual de eXeLearning, de la versión 3.0 a la 4 (52 MB)',
    exampleLoading: 'Cargando el ejemplo…',
    exampleError: 'No se ha podido cargar el ejemplo: ',
    viewAs: 'Cómo ver los cambios',
    version: 'Qué versión de la página',
    modeOld: 'Anterior',
    modeBoth: 'Cambios',
    modeNew: 'Nueva',
    viewText: 'Texto',
    viewSplit: 'Dos columnas',
    viewDesign: 'Con su diseño',
    noDesign: 'Estos archivos no traen las páginas exportadas, así que no pueden verse con su diseño',
    viewPage: 'Ver con su diseño →',
    viewPageHint: 'Muestra la página con el diseño, el menú y las imágenes del proyecto, y los cambios marcados',
    viewNote:
      'La página como la verá el lector. Su código funciona aislado: no puede tocar esta web ni conectarse a internet, así que lo que necesite descargar no aparecerá.',
    pageError: 'No se ha podido mostrar la página: ',
    fullScreen: 'Pantalla completa',
    exitFullScreen: 'Salir de pantalla completa',
    print: 'Imprimir / PDF',
    onlyChanges: 'Solo lo que cambia',
    madeBy: 'Creado por el Área de Tecnología Educativa del Gobierno de Canarias',
    cliTitle: 'Desde la terminal',
    cliIntro:
      'La misma comparación en la línea de órdenes, con Node.js 22 o posterior. Sale con 0 si no hay diferencias y con 1 si las hay.',
    cliReport: 'Guardar un informe HTML',
    cliGit: 'Que git diff muestre los .elpx como texto',
    skillTitle: 'Skill para asistentes de IA',
    skillIntro:
      'Instrucciones para que un agente (Claude Code, Codex, Cursor…) compare dos proyectos con elpx-diff y te resuma los cambios.',
    skillNpx: 'Con npx skills',
    skillGh: 'Con GitHub CLI',
    skillNote: 'La skill usa la línea de órdenes de elpx-diff a través de npx.',
    docs: 'Documentación',
    copy: 'Copiar',
    copied: 'Copiado',
    close: 'Cerrar',
    source: 'Código fuente',
    license: 'Software libre (AGPL-3.0)',
    licenses: 'Licencias',
    licensesTitle: 'Licencias y créditos',
    licensesIntro:
      'elpx-diff es software libre: puedes usarlo, estudiarlo, modificarlo y compartirlo según la licencia GNU Affero General Public License, versión 3 o posterior.',
    licensesApp: 'Licencia de elpx-diff (AGPL-3.0)',
    licensesComponents: 'Componentes incluidos',
    licensesAte: 'El logotipo del ATE es propiedad del Área de Tecnología Educativa del Gobierno de Canarias.',
    other: 'English',
  },
  en: {
    tagline: 'Compares eXeLearning projects. The files never leave your computer.',
    question: 'What changed between two versions of your project?',
    lead: 'Choose two .elpx files and see, page by page, the text added in green and the text removed in red. Everything happens in your browser: nothing is uploaded.',
    before: 'Old version',
    after: 'New version',
    choose: 'Choose an .elpx file',
    hint: 'or drop it here',
    change: 'change file',
    swap: 'Swap the two versions',
    themeDark: 'Switch to dark mode',
    themeLight: 'Switch to light mode',
    comparing: 'Comparing…',
    waiting: 'Choose both versions to see the changes.',
    done: (a: number, m: number, r: number) => `Comparison ready: ${a} added, ${m} modified, ${r} removed.`,
    error: 'The comparison failed: ',
    saveHtml: 'Download HTML',
    saveJson: 'JSON',
    example: "Try an example: eXeLearning's manual, from version 3.0 to 4 (52 MB)",
    exampleLoading: 'Loading the example…',
    exampleError: 'The example could not be loaded: ',
    viewAs: 'How to see the changes',
    version: 'Which version of the page',
    modeOld: 'Old',
    modeBoth: 'Changes',
    modeNew: 'New',
    viewText: 'Text',
    viewSplit: 'Two columns',
    viewDesign: 'With its design',
    noDesign: 'These files do not carry their exported pages, so they cannot be seen with their design',
    viewPage: 'View with its design →',
    viewPageHint: "Shows the page with the project's design, menu and pictures, and the changes marked",
    viewNote:
      'The page as readers will see it. Its code runs cut off: it cannot reach this site or the internet, so whatever it would download does not show.',
    pageError: 'The page could not be shown: ',
    fullScreen: 'Full screen',
    exitFullScreen: 'Exit full screen',
    print: 'Print / PDF',
    onlyChanges: 'Only what changes',
    madeBy: 'Made by the Educational Technology Area of the Government of the Canary Islands',
    cliTitle: 'From the terminal',
    cliIntro:
      'The same comparison on the command line, with Node.js 22 or later. It exits with 0 when there are no differences and with 1 when there are.',
    cliReport: 'Save an HTML report',
    cliGit: 'Make git diff show .elpx files as text',
    skillTitle: 'Skill for AI assistants',
    skillIntro:
      'Instructions for an agent (Claude Code, Codex, Cursor…) to compare two projects with elpx-diff and summarize the changes.',
    skillNpx: 'With npx skills',
    skillGh: 'With the GitHub CLI',
    skillNote: 'The skill uses the elpx-diff command line through npx.',
    docs: 'Documentation',
    copy: 'Copy',
    copied: 'Copied',
    close: 'Close',
    source: 'Source code',
    license: 'Free software (AGPL-3.0)',
    licenses: 'Licenses',
    licensesTitle: 'Licenses and credits',
    licensesIntro:
      'elpx-diff is free software: you may use, study, modify and share it under the GNU Affero General Public License, version 3 or later.',
    licensesApp: 'elpx-diff license (AGPL-3.0)',
    licensesComponents: 'Bundled components',
    licensesAte: 'The ATE logo belongs to the Educational Technology Area of the Government of the Canary Islands.',
    other: 'Español',
  },
};

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const status = $('status');
const result = $('result');
const actions = $('actions');

let lang: Lang = (localStorage.getItem('lang') ?? navigator.language).startsWith('en') ? 'en' : 'es';
/** The report's edits in two columns, before and after, or in one; remembered in this browser. */
let split = localStorage.getItem('view') === 'split';
const files: { before?: File; after?: File } = {};
let diff: ElpxDiff | undefined;
let project: MarkedProject | undefined;
/** The pages that can be viewed, in order, with their path inside each version's package. */
let viewable: { page: PageDiff; new?: string; old?: string }[] = [];
let run = 0;

// Light or dark: the scheme chosen with the header button, remembered in this browser, or else the system's.
const root = document.documentElement;
const storedTheme = localStorage.getItem('theme');
if (storedTheme === 'light' || storedTheme === 'dark') root.dataset['theme'] = storedTheme;
const isDark = (): boolean =>
  (root.dataset['theme'] ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';

function say(text: string, error = false): void {
  status.textContent = text;
  status.classList.toggle('error', error);
  status.setAttribute('role', error ? 'alert' : 'status');
}

function show(): void {
  if (!diff) return;
  // renderHtml escapes every piece of project text; nothing from the files is inserted as markup.
  result.innerHTML = `<p class="compare"><span></span> → <span></span></p>${renderHtml(diff, lang, { split })}`;
  if (localStorage.getItem('toc') === 'closed') result.querySelector<HTMLDetailsElement>('.toc details')!.open = false;
  const [a, b] = result.querySelectorAll('.compare span');
  a!.textContent = diff.before.name;
  b!.textContent = diff.after.name;
  actions.hidden = false;
  say(UI[lang].done(diff.summary.added, diff.summary.modified, diff.summary.removed));
  viewButtons();
  // The viewer takes the report's place. Moved, its frame starts again: the page is shown anew.
  result.querySelector('.layout')!.append(viewer);
  views();
  if (design && current) void view(current, mode);
}

/** "View with its design" on each page of the result that either version exported. */
function viewButtons(): void {
  const pages = diff?.pages ?? [];
  for (const { page } of viewable) {
    const summary = result.querySelector(`#page-${pages.indexOf(page)} > summary`);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'view-page';
    button.textContent = UI[lang].viewPage;
    button.title = UI[lang].viewPageHint;
    button.addEventListener('click', (event) => {
      event.preventDefault(); // inside <summary>: do not fold the page
      setView('design', page);
    });
    // At the end of the line of counts, as a link of its size; a page without counts gets that line for it alone.
    let counts = summary?.querySelector('.counts');
    if (counts) counts.append(' · ');
    else {
      counts = document.createElement('span');
      counts.className = 'counts';
      summary?.append(counts);
    }
    counts.append(button);
  }
}

const viewer = $('viewer');
const frame = $<HTMLIFrameElement>('viewer-frame');
// Kept at hand: the viewer leaves the document each time the result is made anew.
const title = $('viewer-title');
const counts = $('viewer-counts');
const modeGroup = $('viewer-modes');
const modes = [...modeGroup.querySelectorAll('button')];
const tabs = {
  text: $<HTMLButtonElement>('view-text'),
  split: $<HTMLButtonElement>('view-split'),
  design: $<HTMLButtonElement>('view-design'),
};
type View = keyof typeof tabs;
/** Whether pages are seen with their design; the page in the viewer, how it is shown, and which version's it is. */
let design = false;
let current: PageDiff | undefined;
let mode: Mode = 'both';
let side: Side = 'new';
let asked = 0;
/** Whether the page in the frame is the project's, with the script that tells where the reader is. */
let scripted = false;

/** The three views' buttons, and the option that only the report has. */
function views(): void {
  const now: View = design ? 'design' : split ? 'split' : 'text';
  result.classList.toggle('design', design);
  for (const [name, button] of Object.entries(tabs)) button.setAttribute('aria-pressed', String(name === now));
  tabs.design.disabled = viewable.length === 0;
  tabs.design.title = viewable.length === 0 ? UI[lang].noDesign : '';
  $('only-changes-toggle').hidden = design;
}

/** The report, in one column or two, or the pages with their design: then one is shown, the first that changed. */
function setView(to: View, page?: PageDiff): void {
  const was = split;
  if (to !== 'design') split = to === 'split';
  design = to === 'design' && viewable.length > 0;
  if (design) {
    const first = viewable.find((v) => v.page.status !== 'unchanged') ?? viewable[0]!;
    void view(page ?? current ?? first.page, page ? 'both' : mode);
  } else {
    // Leaving stops the page: nothing pending is posted, and its scripts go with it.
    asked++;
    frame.contentWindow?.location.replace('about:blank');
    if (document.fullscreenElement) void document.exitFullscreen();
  }
  if (split !== was) {
    localStorage.setItem('view', split ? 'split' : 'inline');
    show();
  }
  views();
}
for (const [name, button] of Object.entries(tabs)) button.addEventListener('click', () => setView(name as View));

/** Shows one page, marked, in the frame (viewer.html), where its scripts run cut off from the app. */
async function view(page: PageDiff, how: Mode = 'both', anchor?: string): Promise<void> {
  const mine = ++asked; // each request its own number: only the last one's page is posted
  current = page;
  const here = viewable.find((v) => v.page === page);
  // A version the page lacks falls back to the changes; those are on the new version, or on the old one.
  mode = how !== 'both' && !here?.[how] ? 'both' : how;
  side = mode === 'old' ? 'old' : mode === 'new' || here?.new ? 'new' : 'old';
  const t = UI[lang];
  title.textContent = page.title || '—';
  // What the report says under the page's title, and the versions the page has.
  const tally = pageTally(page);
  counts.textContent = tally.added + tally.modified + tally.removed ? strings(lang).tally(tally) : '';
  for (const button of modes) {
    const which = button.dataset['mode'] as Mode;
    button.setAttribute('aria-pressed', String(which === mode));
    button.disabled = which !== 'both' && !here?.[which];
    button.title = button.disabled ? strings(lang)[which === 'new' ? 'notInNew' : 'notInOld'] : '';
  }
  scripted = false;
  // A fresh viewer.html, so that nothing a previous page did stays in it; replaced, not navigated to, so that
  // the pages seen do not pile up in the tab's history.
  const ready = new Promise<void>((resolve) => {
    frame.onload = () => {
      // Not the empty document a frame starts with (put in the page, it announces that one too).
      if (mine !== asked || blank()) return;
      frame.onload = null; // later loads are the page's own doing
      resolve();
    };
  });
  frame.contentWindow?.location.replace(`viewer.html?${mine}`);
  const message = (text: string): string => `<p style="font:1rem system-ui;padding:1rem">${esc(text)}</p>`;
  let html: string;
  let ours = true; // the project's page, not the note that it could not be shown
  try {
    html = (await project!.page(page, { lang, mode, ...(anchor ? { anchor } : {}) }))!;
  } catch (error) {
    ours = false;
    html = message(t.pageError + (error instanceof Error ? error.message : String(error)));
  }
  await ready;
  if (mine !== asked) return;
  frame.contentWindow?.postMessage({ type: 'elpx-diff-page', html }, '*');
  scripted = ours;
}
for (const button of modes)
  button.addEventListener('click', () => {
    const to = button.dataset['mode'] as Mode;
    if (!current || to === mode) return;
    // The page says where the reader is, so that the other version opens there (it answers with the message
    // below); one that is not there yet, or could not be put together, is just shown from its top.
    if (scripted) frame.contentWindow?.postMessage({ type: 'elpx-diff-switch', mode: to }, '*');
    else void view(current, to);
  });
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Whether the frame holds its empty first document; viewer.html, of another origin, does not let itself be read. */
function blank(): boolean {
  try {
    return frame.contentWindow!.location.href === 'about:blank';
  } catch {
    return false;
  }
}
// Full screen gives the page the whole screen (not on phones that lack it).
const full = $<HTMLButtonElement>('viewer-full');
full.hidden = !document.fullscreenEnabled;
full.addEventListener('click', () => {
  void (document.fullscreenElement ? document.exitFullscreen() : viewer.requestFullscreen());
});
const fullLabel = (): void => {
  full.textContent = document.fullscreenElement ? UI[lang].exitFullScreen : UI[lang].fullScreen;
};
document.addEventListener('fullscreenchange', fullLabel);
// A link to another page, clicked in the frame, comes as a message: only from the frame, only to a known page.
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow || !design || !current) return;
  // Anything may come from the page: each field is checked before use (OpenMessage, ModeMessage).
  const data = event.data as {
    type?: unknown;
    path?: unknown;
    page?: unknown;
    mode?: unknown;
    anchor?: unknown;
  } | null;
  if (data?.type === 'elpx-diff-mode') {
    // The same page shown another way, at the same iDevice.
    if (data.mode === 'old' || data.mode === 'both' || data.mode === 'new')
      void view(current, data.mode, typeof data.anchor === 'string' ? data.anchor.slice(0, 2000) : undefined);
    return;
  }
  if (data?.type !== 'elpx-diff-open') return;
  // A page only the other version has, picked in the menu where it is listed: shown in the version that has it.
  const other =
    typeof data.page === 'number' ? viewable.find((v) => v.page === diff!.pages[data.page as number]) : undefined;
  if (other) return void view(other.page);
  if (typeof data.path !== 'string') return;
  if (data.path === SUMMARY_PAGE) return setView(split ? 'split' : 'text'); // "all the pages with changes": the report
  // A link leads to a page of the version on screen; it opens shown the same way.
  const next = viewable.find((v) => v[side] === data.path);
  if (next) void view(next.page, mode);
});

function paint(): void {
  const t = UI[lang];
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll<HTMLElement>('[data-t]')) el.textContent = t[el.dataset['t'] as 'lead'];
  for (const side of ['before', 'after'] as const) {
    const drop = $(`drop-${side}`);
    drop.classList.toggle('filled', !!files[side]);
    if (files[side]) {
      drop.querySelector('.file')!.textContent = files[side].name;
      drop.querySelector('.hint')!.textContent = t.change;
    }
  }
  document.body.classList.toggle('compared', !!files.before && !!files.after);
  fullLabel();
  $('views').setAttribute('aria-label', t.viewAs);
  modeGroup.setAttribute('aria-label', t.version);
  $('swap').setAttribute('aria-label', t.swap);
  $('swap').title = t.swap;
  $('theme').setAttribute('aria-label', isDark() ? t.themeLight : t.themeDark);
  $('theme').title = isDark() ? t.themeLight : t.themeDark;
  const other = lang === 'es' ? 'en' : 'es';
  $('lang').textContent = t.other;
  $('lang').lang = other;
  if (diff) show();
  else if (!status.classList.contains('error')) say(t.waiting);
}

async function compare(): Promise<void> {
  const mine = ++run;
  diff = undefined;
  project = undefined;
  viewable = [];
  current = undefined;
  setView(split ? 'split' : 'text');
  result.replaceChildren();
  actions.hidden = true;
  paint();
  if (!files.before || !files.after) return;
  say(UI[lang].comparing);
  try {
    const next = await markProject(files.before, files.after, { lang });
    if (mine !== run) return; // a newer comparison started meanwhile
    [project, diff] = [next, next.diff];
    show();
  } catch (error) {
    if (mine === run) say(UI[lang].error + (error instanceof Error ? error.message : String(error)), true);
    return;
  }
  // Which pages have an exported page is known once their files are read; seeing them with their design comes
  // then. A package whose pages cannot be read still has its report: it just cannot be seen that way.
  const [newer, older] = await Promise.all([project.paths('new'), project.paths('old')]).catch(() => [
    new Map<PageDiff, string>(),
    new Map<PageDiff, string>(),
  ]);
  if (mine !== run) return;
  viewable = diff.pages
    .filter((p) => newer.has(p) || older.has(p))
    .map((p) => ({ page: p, new: newer.get(p), old: older.get(p) }));
  viewButtons();
  views();
}

/** Two files at once fill both sides, older first. */
function take(side: 'before' | 'after', list: FileList | null | undefined): void {
  const picked = [...(list ?? [])];
  if (picked.length === 0) return;
  if (picked.length >= 2)
    [files.before, files.after] = picked.slice(0, 2).sort((x, y) => x.lastModified - y.lastModified);
  else files[side] = picked[0];
  void compare();
}

for (const side of ['before', 'after'] as const) {
  const drop = $(`drop-${side}`);
  const input = $<HTMLInputElement>(`file-${side}`);
  input.addEventListener('change', () => {
    take(side, input.files);
    input.value = '';
  });
  for (const type of ['dragenter', 'dragover', 'dragleave', 'drop'] as const) {
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.toggle('over', type === 'dragenter' || type === 'dragover');
      if (type === 'drop') take(side, event.dataTransfer?.files);
    });
  }
}
// A file dropped outside the two zones must not make the browser navigate to it.
for (const type of ['dragover', 'drop'] as const) window.addEventListener(type, (event) => event.preventDefault());

$('swap').addEventListener('click', () => {
  [files.before, files.after] = [files.after, files.before];
  for (const side of ['before', 'after'] as const)
    if (!files[side]) $(`drop-${side}`).querySelector('.file')!.textContent = UI[lang].choose;
  void compare();
});
$('theme').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  root.dataset['theme'] = next;
  localStorage.setItem('theme', next);
  paint();
});
$('lang').addEventListener('click', () => {
  lang = lang === 'es' ? 'en' : 'es';
  localStorage.setItem('lang', lang);
  paint();
});

// The example: two versions of eXeLearning's manual, from this same site, compared as if they had been chosen.
$('example').addEventListener('click', async () => {
  say(UI[lang].exampleLoading);
  try {
    const [before, after] = await Promise.all(
      ['manual-3.elpx', 'manual-4.elpx'].map(async (name) => {
        const response = await fetch(`examples/${name}`);
        if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
        return new File([await response.blob()], name);
      }),
    );
    [files.before, files.after] = [before, after];
    void compare();
  } catch (error) {
    say(UI[lang].exampleError + (error instanceof Error ? error.message : String(error)), true);
  }
});

// The CLI and Skill panels: native dialogs, with a copy button on each command.
for (const button of document.querySelectorAll<HTMLElement>('[data-open]')) {
  button.addEventListener('click', () => $<HTMLDialogElement>(button.dataset['open']!).showModal());
}
for (const button of document.querySelectorAll<HTMLElement>('[data-close]')) {
  button.addEventListener('click', () => button.closest('dialog')!.close());
}
for (const button of document.querySelectorAll<HTMLElement>('[data-copy]')) {
  button.addEventListener('click', () => {
    void navigator.clipboard.writeText(button.parentElement!.querySelector('code')!.textContent).then(() => {
      button.textContent = UI[lang].copied;
    });
  });
}

function save(name: string, type: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('save-html').addEventListener(
  'click',
  () => diff && save('elpx-diff.html', 'text/html', renderReport(diff, lang, { split })),
);
$('save-json').addEventListener(
  'click',
  () => diff && save('elpx-diff.json', 'application/json', JSON.stringify(diff, null, 2)),
);
const onlyChanges = $<HTMLInputElement>('only-changes');
onlyChanges.addEventListener('change', () => result.classList.toggle('only-changes', onlyChanges.checked));
// The index folds away to give the comparison the whole width; the choice is remembered.
result.addEventListener(
  'toggle',
  (event) => {
    const details = event.target as HTMLDetailsElement;
    if (details.parentElement?.classList.contains('toc')) localStorage.setItem('toc', details.open ? 'open' : 'closed');
  },
  true,
);
$('print').addEventListener('click', () => {
  setView(split ? 'split' : 'text'); // the report is what is printed
  for (const d of result.querySelectorAll('details')) d.open = true;
  window.print();
});

const version = $<HTMLAnchorElement>('version');
version.textContent = `v${pkg.version}`;
version.href = `https://github.com/ateeducacion/elpx-diff/releases/tag/v${pkg.version}`;

paint();
