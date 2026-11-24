import pkg from '../../package.json' with { type: 'json' };
import { diffElpx, type ElpxDiff } from '../diff.js';
import type { Lang } from '../i18n.js';
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
    saveHtml: 'Descargar informe',
    saveJson: 'JSON',
    print: 'Imprimir',
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
    saveHtml: 'Download report',
    saveJson: 'JSON',
    print: 'Print',
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
const files: { before?: File; after?: File } = {};
let diff: ElpxDiff | undefined;
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
  result.innerHTML = `<p class="compare"><span></span> → <span></span></p>${renderHtml(diff, lang)}`;
  const [a, b] = result.querySelectorAll('.compare span');
  a!.textContent = diff.before.name;
  b!.textContent = diff.after.name;
  actions.hidden = false;
  say(UI[lang].done(diff.summary.added, diff.summary.modified, diff.summary.removed));
}

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
  result.replaceChildren();
  actions.hidden = true;
  paint();
  if (!files.before || !files.after) return;
  say(UI[lang].comparing);
  try {
    const next = await diffElpx(files.before, files.after);
    if (mine !== run) return; // a newer comparison started meanwhile
    diff = next;
    show();
  } catch (error) {
    if (mine === run) say(UI[lang].error + (error instanceof Error ? error.message : String(error)), true);
  }
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
$('save-html').addEventListener('click', () => diff && save('elpx-diff.html', 'text/html', renderReport(diff, lang)));
$('save-json').addEventListener(
  'click',
  () => diff && save('elpx-diff.json', 'application/json', JSON.stringify(diff, null, 2)),
);
const onlyChanges = $<HTMLInputElement>('only-changes');
onlyChanges.addEventListener('change', () => result.classList.toggle('only-changes', onlyChanges.checked));
$('print').addEventListener('click', () => {
  for (const d of result.querySelectorAll('details')) d.open = true;
  window.print();
});

const version = $<HTMLAnchorElement>('version');
version.textContent = `v${pkg.version}`;
version.href = `https://github.com/ateeducacion/elpx-diff/releases/tag/v${pkg.version}`;

paint();
