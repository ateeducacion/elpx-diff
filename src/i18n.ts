export type Lang = 'es' | 'en';

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
  skipped: (n: number) => `${n} líneas sin cambios`,
  addedLine: 'Añadido: ',
  removedLine: 'Eliminado: ',
  wasCalled: 'antes',
  report: 'Comparación de proyectos eXeLearning',
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
  skipped: (n: number) => `${n} unchanged lines`,
  addedLine: 'Added: ',
  removedLine: 'Removed: ',
  wasCalled: 'was',
  report: 'eXeLearning project comparison',
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
