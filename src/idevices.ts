import type { Lang } from './i18n.js';

/**
 * The names eXeLearning gives its iDevices, in English and Spanish: titles from
 * each iDevice's config.xml and their translations in translations/messages.es.xlf
 * (github.com/exelearning/exelearning).
 */
const NAMES: Record<string, [en: string, es: string]> = {
  '3dmol': ['3DMol', '3DMol'],
  'adaptative-quiz': ['Adaptative Quiz', 'Cuestionario adaptativo'],
  'az-quiz-game': ['A-Z quiz', 'Rosco'],
  beforeafter: ['Before/After', 'Antes/Después'],
  casestudy: ['Case study', 'Caso práctico'],
  challenge: ['Challenge', 'Desafío'],
  checklist: ['Checklist', 'Lista de cotejo'],
  classify: ['Classify', 'Clasifica'],
  complete: ['Complete', 'Completa'],
  crossword: ['Crossword', 'Crucigrama'],
  digcompedu: ['DigCompEdu', 'DigCompEdu'],
  discover: ['Discover', 'Descubre'],
  'download-source-file': ['Download source file', 'Descargar el archivo fuente'],
  dragdrop: ['Drag and drop', 'Arrastra'],
  'electrical-circuits': ['Electrical Circuits', 'Circuitos eléctricos'],
  example: ['Example', 'Ejemplo'],
  'external-website': ['External website', 'Sitio web externo'],
  'file-attachment': ['File attachments', 'Archivos adjuntos'],
  flipcards: ['Memory cards', 'Tarjetas de memoria'],
  form: ['Form', 'Formulario'],
  'geogebra-activity': ['GeoGebra activity', 'GeoGebra'],
  guess: ['Guess', 'Adivina'],
  'hidden-image': ['Hidden image', 'Imagen oculta'],
  identify: ['Identify', 'Identifica'],
  'image-gallery': ['Image gallery', 'Galería de imágenes'],
  'interactive-video': ['Interactive video', 'Vídeo interactivo'],
  lomloe: ['LOMLOE: Fundamentación Curricular', 'LOMLOE: Fundamentación Curricular'],
  magnifier: ['Magnifier', 'Lupa'],
  map: ['Map', 'Mapa'],
  'markdown-text': ['Markdown text', 'Texto Markdown'],
  mathematicaloperations: ['Math operations', 'Operaciones matemáticas'],
  mathproblems: ['Math problems', 'Problemas matemáticos'],
  padlock: ['Padlock', 'Candado'],
  'periodic-table': ['Periodic table', 'Tabla periódica'],
  'progress-report': ['Progress report', 'Informe de progreso'],
  puzzle: ['Puzzle', 'Puzle'],
  'quick-questions-multiple-choice': ['Select', 'Selecciona'],
  'quick-questions-video': ['Video test', 'Videotest'],
  'quick-questions': ['Test', 'Test'],
  relate: ['Relate', 'Relaciona'],
  rubric: ['Rubric', 'Rúbrica'],
  'scrambled-list': ['Scrambled list', 'Lista desordenada'],
  'select-media-files': ['Select media files', 'Selecciona (multimedia)'],
  slide: ['Slide', 'Diapositiva'],
  sort: ['Sort', 'Ordena'],
  text: ['Text', 'Texto'],
  'three-d-viewer': ['3D Viewer', 'Visor 3D'],
  'three-sixty-viewer': ['360° panorama viewer', 'Visor panorama 360°'],
  trivial: ['TriviExt', 'TriviExt'],
  trueorfalse: ['True or false', 'Verdadero o falso'],
  'udl-content': ['UDL Content', 'Contenido DUA'],
  'word-search': ['Word search', 'Buscar palabras'],
};

/** The name a teacher sees in eXeLearning; an unknown type keeps its identifier. */
export const ideviceName = (type: string, lang: Lang): string => NAMES[type]?.[lang === 'es' ? 1 : 0] ?? type;
