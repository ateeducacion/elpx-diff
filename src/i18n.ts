export type Lang = 'es' | 'en';

/** How many iDevices were added, modified and removed (on a page, for instance). */
export interface Tally {
  added: number;
  modified: number;
  removed: number;
}

/** "3 added, 1 modified": the non-zero counts, each with its singular or plural word. */
const list = (c: Tally, ...words: [string, string][]): string =>
  [c.added, c.modified, c.removed]
    .map((n, i) => (n ? `${n} ${words[i]![n === 1 ? 0 : 1]}` : ''))
    .filter(Boolean)
    .join(', ');

const es = {
  added: 'Añadido',
  removed: 'Eliminado',
  modified: 'Modificado',
  unchanged: 'Sin cambios',
  renamed: 'Renombrado',
  moved: 'Movido',
  addedMany: 'Añadidos',
  removedMany: 'Eliminados',
  modifiedMany: 'Modificados',
  summary: 'Resumen de cambios',
  identical: 'Los dos proyectos tienen el mismo contenido.',
  metadata: 'Metadatos',
  property: 'Propiedad',
  before: 'Antes',
  after: 'Después',
  pages: 'Páginas',
  index: 'Índice de cambios',
  also: 'También cambia',
  resources: 'Archivos',
  untitled: '(sin título)',
  empty: '(sin texto)',
  formatOnly: 'Mismo texto; cambia el formato o la configuración.',
  skipped: (n: number) => (n === 1 ? '1 línea sin cambios' : `${n} líneas sin cambios`),
  addedLine: 'Añadido: ',
  removedLine: 'Eliminado: ',
  wasCalled: 'antes',
  report: 'Comparación de proyectos eXeLearning',
  tally: (c: Tally) =>
    `iDevices: ${list(c, ['añadido', 'añadidos'], ['modificado', 'modificados'], ['eliminado', 'eliminados'])}`,
  formatShort: 'formato',
  movedIdevice: 'Mismo contenido; ha cambiado de sitio.',
  markedTitle: 'Web con los cambios marcados',
  markedIntro:
    'Esta es la web de la versión nueva. En cada página, los iDevices añadidos llevan fondo verde, y los modificados, una franja ámbar y, encima, lo que ha cambiado en ellos: en rojo y tachado el texto anterior, en verde el nuevo. Arriba, un recuadro resume los cambios de la página y lista lo eliminado. Los bloques plegados y las pestañas hay que abrirlos para ver sus marcas.',
  markedHere: 'Cambios en esta página',
  newPage: 'Página nueva.',
  noChanges: 'Sin cambios en esta página.',
  renamedFrom: (old: string) => `Antes se llamaba «${old}».`,
  movedPage: 'Ha cambiado de sitio en el índice.',
  removedHere: (n: number) => `Eliminado (${n})`,
  allChanges: 'Todas las páginas con cambios',
  page: 'Página',
  changedPages: (n: number) => (n === 1 ? '1 página con cambios' : `${n} páginas con cambios`),
  unchangedPages: (n: number) => (n === 1 ? '1 página sin cambios.' : `${n} páginas sin cambios.`),
  removedPages: 'Páginas eliminadas',
  openSite: 'Abrir la web desde su primera página',
  paragraphs: (n: number, e: number) =>
    `párrafos: ${[n ? `${n} ${n === 1 ? 'nuevo' : 'nuevos'}` : '', e ? `${e} ${e === 1 ? 'retocado' : 'retocados'}` : ''].filter(Boolean).join(', ')}`,
  hideMarks: 'Ocultar las marcas',
  paragraphsOld: (n: number, e: number) =>
    `párrafos: ${[n ? `${n} ${n === 1 ? 'eliminado' : 'eliminados'}` : '', e ? `${e} ${e === 1 ? 'retocado' : 'retocados'}` : ''].filter(Boolean).join(', ')}`,
  removedPage: 'Esta página no está en la versión nueva.',
  renamedTo: (name: string) => `En la versión nueva se llama «${name}».`,
  addedHere: (n: number) => `Añadido en la versión nueva (${n})`,
  version: 'Versión',
  newVersion: 'Versión nueva',
  oldVersion: 'Versión anterior',
  changesView: 'Cambios',
  notInNew: 'Esta página no está en la versión nueva',
  notInOld: 'Esta página no existía en la versión anterior',
  showMarks: 'Mostrar las marcas',
};

const en: typeof es = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
  unchanged: 'Unchanged',
  renamed: 'Renamed',
  moved: 'Moved',
  addedMany: 'Added',
  removedMany: 'Removed',
  modifiedMany: 'Modified',
  summary: 'Summary of changes',
  identical: 'Both projects have the same content.',
  metadata: 'Metadata',
  property: 'Property',
  before: 'Before',
  after: 'After',
  pages: 'Pages',
  index: 'Index of changes',
  also: 'Also changed',
  resources: 'Files',
  untitled: '(untitled)',
  empty: '(no text)',
  formatOnly: 'Same text; formatting or settings changed.',
  skipped: (n: number) => (n === 1 ? '1 unchanged line' : `${n} unchanged lines`),
  addedLine: 'Added: ',
  removedLine: 'Removed: ',
  wasCalled: 'was',
  report: 'eXeLearning project comparison',
  tally: (c: Tally) => `iDevices: ${list(c, ['added', 'added'], ['modified', 'modified'], ['removed', 'removed'])}`,
  formatShort: 'formatting',
  movedIdevice: 'Same content; it moved.',
  markedTitle: 'Website with the changes marked',
  markedIntro:
    'This is the website of the new version. On each page, added iDevices have a green background, and modified ones an amber bar and, above them, what changed in them: the old text struck through in red, the new one in green. At the top, a box sums up the changes on the page and lists what was removed. Folded boxes and tabs have to be opened to see their marks.',
  markedHere: 'Changes on this page',
  newPage: 'New page.',
  noChanges: 'No changes on this page.',
  renamedFrom: (old: string) => `Was called “${old}”.`,
  movedPage: 'Moved in the navigation.',
  removedHere: (n: number) => `Removed (${n})`,
  allChanges: 'All the pages with changes',
  page: 'Page',
  changedPages: (n: number) => (n === 1 ? '1 page with changes' : `${n} pages with changes`),
  unchangedPages: (n: number) => (n === 1 ? '1 page without changes.' : `${n} pages without changes.`),
  removedPages: 'Removed pages',
  openSite: 'Open the website at its first page',
  paragraphs: (n: number, e: number) =>
    `paragraphs: ${[n ? `${n} new` : '', e ? `${e} edited` : ''].filter(Boolean).join(', ')}`,
  hideMarks: 'Hide the marks',
  paragraphsOld: (n: number, e: number) =>
    `paragraphs: ${[n ? `${n} removed` : '', e ? `${e} edited` : ''].filter(Boolean).join(', ')}`,
  removedPage: 'This page is not in the new version.',
  renamedTo: (name: string) => `In the new version it is called “${name}”.`,
  addedHere: (n: number) => `Added in the new version (${n})`,
  version: 'Version',
  newVersion: 'New version',
  oldVersion: 'Old version',
  changesView: 'Changes',
  notInNew: 'This page is not in the new version',
  notInOld: 'This page did not exist in the old version',
  showMarks: 'Show the marks',
};

export const strings = (lang: Lang): typeof es => (lang === 'es' ? es : en);

export const formatSize = (bytes: number): string => {
  const units = ['B', 'kB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i++;
  }
  return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`;
};
