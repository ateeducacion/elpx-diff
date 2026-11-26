#!/usr/bin/env bun
/**
 * Writes the web app's example: two versions of a small resource on the water cycle, in Spanish and in
 * English (src/web/examples/). Run by hand when the example changes; the four files are kept in the
 * repository, so building the site fetches nothing.
 *
 * The resource follows the example of the ATE style for eXeLearning, whose libraries and
 * illustrations are taken from its repository; it wears eXeLearning's own base style, taken from
 * eXeLearning (.cache/ keeps both copies). The text, the pages and what
 * changes from one version to the other are written here, and from them come both content.xml and
 * the exported pages, as eXeLearning 4 saves them inside an .elpx.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';

import { $ } from 'bun';
import { strToU8, zipSync } from 'fflate';

const STYLE = 'https://github.com/ateeducacion/exelearning-style-ate.git';
const COMMIT = '020e47803320756edf439d3e42880f23b2ff3fb5';
const BASE = '.cache/exelearning-style-ate';
const EXE = '.cache/exelearning';
const THEME = `${EXE}/public/files/perm/themes/base/base`;
const OUT = 'src/web/examples';

type Lang = 'es' | 'en';
interface Idevice {
  id: string;
  type: 'text' | 'scrambled-list' | 'trueorfalse';
  html: string;
  json: Record<string, unknown>;
}
interface Box {
  id: string;
  title: string;
  icon: string;
  idevices: Idevice[];
}
interface Page {
  id: string;
  title: string;
  parent?: string;
  boxes: Box[];
}
interface Resource {
  lang: Lang;
  title: string;
  description: string;
  pages: Page[];
  /** The images of content/resources, by name. */
  images: Record<string, string>;
}

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (title: string): string =>
  title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// The two illustrations the original does not have, in its same palette.
const frame = (title: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img"><title>${title}</title><rect width="800" height="600" fill="white"/><rect x="32" y="32" width="736" height="536" rx="32" fill="#DDE1EE"/>${body}</svg>\n`;
const drop = (x: number, y: number): string =>
  `<path d="M${x} ${y - 22}C${x - 7} ${y - 9} ${x - 17} ${y + 1} ${x - 17} ${y + 11}A17 17 0 0 0 ${x + 17} ${y + 11}C${x + 17} ${y + 1} ${x + 7} ${y - 9} ${x} ${y - 22}Z" fill="#3F4D88"/>`;
const cloud = (x: number, y: number, fill = 'white'): string =>
  `<g fill="${fill}"><circle cx="${x}" cy="${y}" r="34"/><circle cx="${x + 44}" cy="${y - 18}" r="44"/><circle cx="${x + 96}" cy="${y}" r="36"/><rect x="${x}" y="${y - 6}" width="96" height="40" rx="20"/></g>`;
const AQUIFER = (title: string): string =>
  frame(
    title,
    `${cloud(300, 130)}${drop(330, 215)}${drop(380, 240)}${drop(430, 215)}` +
      `<path d="M64 300H736V512Q736 536 712 536H88Q64 536 64 512Z" fill="#C9B79C"/>` +
      `<path d="M64 300H736V330H64Z" fill="#6E8B5B"/>` +
      `<path d="M64 440Q232 416 400 440T736 440V512Q736 536 712 536H88Q64 536 64 512Z" fill="#9FA6C3"/>` +
      `<path d="M330 340V410M380 350V420M430 340V410" fill="none" stroke="#3F4D88" stroke-width="8" stroke-linecap="round" stroke-dasharray="2 18"/>` +
      `<path d="M120 480Q165 466 210 480M300 494Q345 480 390 494M520 480Q565 466 610 480" fill="none" stroke="#3F4D88" stroke-width="6" stroke-linecap="round"/>` +
      `<rect x="590" y="250" width="22" height="200" fill="#3F4D88"/><rect x="574" y="236" width="54" height="18" rx="6" fill="#3F4D88"/>`,
  );
const ISLAND = (title: string): string =>
  frame(
    title,
    `<circle cx="640" cy="130" r="43" fill="#E7B012"/>` +
      `<path d="M150 470L330 170Q400 90 470 170L650 470Z" fill="#6E8B5B"/>` +
      `<path d="M352 150Q400 100 448 150L470 190H330Z" fill="#C9B79C"/>` +
      `${cloud(110, 300)}${cloud(250, 320)}${cloud(60, 340)}` +
      `<path d="M64 460Q148 436 232 460T400 460T568 460T736 460V512Q736 536 712 536H88Q64 536 64 512Z" fill="#9FA6C3"/>` +
      `${drop(300, 400)}${drop(350, 420)}`,
  );

/** The resource in one language, as it was (1) and as it is now (2). */
function resource(lang: Lang, version: 1 | 2): Resource {
  const L = (es: string, en: string): string => (lang === 'es' ? es : en);
  const now = version === 2;
  const V = (before: string, after: string): string => (now ? after : before);

  const fig = (image: string, caption: string): string =>
    `<figure style="text-align:center;margin:10px 0 18px;"><img src="{{context_path}}/content/resources/${image}" alt="${esc(caption)}" style="max-width:320px;width:100%;height:auto;" /><figcaption style="font-style:italic;font-size:15px;color:#595959;margin-top:6px;">${caption}</figcaption></figure>`;
  const text = (id: string, body: string): Idevice => ({
    id,
    type: 'text',
    html: `<div class="exe-text-template"><div class="textIdeviceContent"><div class="exe-text-activity"><div>${body}<p class="clearfix"> </p></div></div></div></div>`,
    json: {
      ideviceId: id,
      textInfoDurationInput: '',
      textInfoDurationTextInput: L('Duración:', 'Duration:'),
      textInfoParticipantsInput: '',
      textInfoParticipantsTextInput: L('Agrupar:', 'Grouping:'),
      textTextarea: body,
    },
  });
  const order = (id: string, instructions: string, options: string[]): Idevice => {
    const [check, right, wrong] = [
      L('Comprobar', 'Check'),
      L('¡Correcto!', 'Correct!'),
      L('Aún no. El orden correcto es:', 'Not yet. The right order is:'),
    ];
    return {
      id,
      type: 'scrambled-list',
      html: `<div class="exe-sortableList" id="sl${id}" scorm=false><div class="game-evaluation-ids js-hidden" data-id="${id}" data-evaluationid="98765"></div><div class="exe-sortableList-instructions"><p>${instructions}</p></div><ul class="exe-sortableList-list">${options.map((o) => `<li>${o}</li>`).join('')}</ul><div style="display:none"><p class="exe-sortableList-buttonText">${check}</p><p class="exe-sortableList-rightText">${right}</p><p class="exe-sortableList-wrongText">${wrong}</p></div><div class="exe-scorm-message"></div></div>`,
      json: {
        typeGame: 'ScrambledList',
        instructions: `<p>${instructions}</p>`,
        textAfter: '',
        afterElement: '',
        options,
        time: 0,
        buttonText: check,
        rightText: right,
        wrongText: wrong,
        isScorm: 0,
        textButtonScorm: L('Guardar puntuación', 'Save score'),
        repeatActivity: true,
        weighted: 100,
        evaluation: true,
        evaluationID: '98765',
        main: `sl${id}`,
      },
    };
  };
  const trueOrFalse = (id: string, instructions: string, questions: [string, string, 0 | 1][]): Idevice => ({
    id,
    type: 'trueorfalse',
    html: `<div class="exe-tof-template" id="tf${id}"><div class="exe-tof-instructions"><p>${instructions}</p></div>${questions.map(([q]) => `<div class="exe-tof-question"><p>${q}</p></div>`).join('')}</div>`,
    json: {
      ideviceId: id,
      isScorm: 0,
      evaluation: false,
      isTest: true,
      time: 0,
      typeGame: 'TrueOrFalse',
      eXeGameInstructions: `<p>${instructions}</p>`,
      eXeIdeviceTextAfter: '',
      showSlider: false,
      questionsGame: questions.map(([question, feedback, solution]) => ({
        question,
        feedback,
        suggestion: '',
        solution,
      })),
      msgs: {
        msgNoImage: L('Pregunta sin imagen', 'Question without an image'),
        msgFeedback: L('Retroalimentación', 'Feedback'),
        msgSuggestion: L('Pista', 'Hint'),
        msgSolution: L('Solución', 'Solution'),
        msgQuestion: L('Pregunta', 'Question'),
        msgTrue: L('Verdadero', 'True'),
        msgFalse: L('Falso', 'False'),
        msgOk: L('Correcto', 'Right'),
        msgKO: L('Incorrecto', 'Wrong'),
        msgShow: L('Mostrar', 'Show'),
        msgHide: L('Ocultar', 'Hide'),
        msgReboot: L('¡Inténtalo de nuevo!', 'Try again!'),
        msgCheck: L('Comprobar', 'Check'),
        msgStartGame: L('Haz clic aquí para comenzar', 'Click here to start'),
        msgYouScore: L('Tu puntuación', 'Your score'),
        textButtonScorm: L('Guardar puntuación', 'Save score'),
        msgNext: L('Siguiente', 'Next'),
        msgPrevious: L('Anterior', 'Previous'),
        msgTime: L('Tiempo por pregunta', 'Time per question'),
      },
    },
  });
  const box = (id: string, title: string, icon: string, ...idevices: Idevice[]): Box => ({ id, title, icon, idevices });
  const p = (...paragraphs: string[]): string => paragraphs.map((one) => `<p>${one}</p>`).join('');
  const ul = (...items: string[]): string => `<ul>${items.map((one) => `<li>${one}</li>`).join('')}</ul>`;
  const ol = (...items: string[]): string => `<ol>${items.map((one) => `<li>${one}</li>`).join('')}</ol>`;

  const scheme = readFileSync(`${BASE}/content/resources/SP00000006/02-el-ciclo-del-agua.svg`, 'utf8');
  const base = (path: string): string => readFileSync(`${BASE}/content/resources/${path}`, 'utf8');
  const images: Record<string, string> = {
    // The second edition's scheme also shows the water that seeps into the ground.
    'water-cycle.svg': now
      ? scheme.replace(
          '</svg>',
          '<path d="M560 452V520M610 452V520" fill="none" stroke="#3F4D88" stroke-width="9" stroke-linecap="round" stroke-dasharray="2 18"/></svg>',
        )
      : scheme,
    'evaporation.svg': base('SP00000011/03-evaporacion.svg'),
    'condensation.svg': base('SP00000014/04-condensacion.svg'),
    'precipitation.svg': base('SP00000017/05-precipitacion.svg'),
    'collection.svg': base('SP00000020/06-recogida.svg'),
    'activities.svg': base('SP00000023/07-actividades.svg'),
    'order.svg': base('SP00000026/08-ordena-las-fases.svg'),
    'true-or-false.svg': base('SP00000031/09-verdadero-o-falso.svg'),
    'resources.svg': base('SP00000036/10-recursos.svg'),
    'credits.svg': base('SP00000039/11-creditos-y-descargas.svg'),
    'islands.svg': ISLAND(L('Una isla alta detiene las nubes', 'A high island stops the clouds')),
    ...(now
      ? { 'aquifer.svg': AQUIFER(L('El agua se filtra hasta el acuífero', 'Water seeps down to the aquifer')) }
      : {}),
  };

  const phases = [
    L(
      '<strong>Evaporación:</strong> el agua líquida se convierte en vapor.',
      '<strong>Evaporation:</strong> liquid water turns into vapour.',
    ),
    L(
      '<strong>Condensación:</strong> el vapor se enfría y forma nubes.',
      '<strong>Condensation:</strong> the vapour cools down and forms clouds.',
    ),
    L(
      '<strong>Precipitación:</strong> el agua vuelve a la superficie en forma de lluvia, granizo o nieve.',
      '<strong>Precipitation:</strong> water returns to the surface as rain, hail or snow.',
    ),
    ...(now
      ? [
          L(
            '<strong>Infiltración:</strong> parte del agua se filtra en el suelo y alimenta los acuíferos.',
            '<strong>Infiltration:</strong> part of the water seeps into the ground and feeds the aquifers.',
          ),
        ]
      : []),
    L(
      '<strong>Recogida:</strong> el agua fluye por ríos y lagos hasta los océanos.',
      '<strong>Collection:</strong> water flows through rivers and lakes to the oceans.',
    ),
  ];

  const pages: Page[] = [
    {
      id: 'page-home',
      title: L('Inicio', 'Home'),
      boxes: [
        box(
          'box-welcome',
          L('Bienvenida', 'Welcome'),
          'book',
          text(
            'idev-welcome',
            p(
              V(
                L(
                  '<strong>Evaporación, condensación, precipitación y recogida</strong>, con dos actividades para comprobar lo aprendido.',
                  '<strong>Evaporation, condensation, precipitation and collection</strong>, with two activities to check what you have learned.',
                ),
                L(
                  '<strong>Evaporación, condensación, precipitación, infiltración y recogida</strong>, con dos actividades para comprobar lo aprendido y un glosario ampliado.',
                  '<strong>Evaporation, condensation, precipitation, infiltration and collection</strong>, with two activities to check what you have learned and a longer glossary.',
                ),
              ),
              L(
                'Este recurso recorre el viaje que hace el agua entre el mar, el cielo y la tierra, y se detiene en un caso cercano: el agua en las islas Canarias.',
                'This resource follows the journey water makes between the sea, the sky and the land, and stops at a case close to home: water in the Canary Islands.',
              ),
            ),
          ),
        ),
        box(
          'box-goals',
          L('Qué vas a aprender', 'What you will learn'),
          'objectives',
          text(
            'idev-goals',
            ul(
              L(
                'A nombrar las fases del ciclo del agua y explicar qué ocurre en cada una.',
                'To name the phases of the water cycle and explain what happens in each one.',
              ),
              L(
                'A reconocer el papel del Sol como motor del ciclo.',
                'To recognise the role of the Sun as the engine of the cycle.',
              ),
              V(
                L('A distinguir lluvia, granizo y nieve.', 'To tell rain, hail and snow apart.'),
                L('A distinguir lluvia, llovizna, granizo y nieve.', 'To tell rain, drizzle, hail and snow apart.'),
              ),
              L(
                'A valorar por qué el agua dulce es un recurso escaso.',
                'To appreciate why fresh water is a scarce resource.',
              ),
            ),
          ),
        ),
        ...(now
          ? [
              box(
                'box-news',
                L('Novedades de esta edición', 'New in this edition'),
                'info',
                text(
                  'idev-news',
                  p(
                    L(
                      'La segunda edición añade una página sobre la <strong>infiltración</strong> y las aguas subterráneas, amplía el glosario y actualiza las actividades.',
                      'The second edition adds a page on <strong>infiltration</strong> and groundwater, extends the glossary and updates the activities.',
                    ),
                  ),
                ),
              ),
            ]
          : []),
      ],
    },
    {
      id: 'page-cycle',
      title: L('El ciclo del agua', 'The water cycle'),
      boxes: [
        box(
          'box-what',
          L('¿Qué es el ciclo del agua?', 'What is the water cycle?'),
          'info',
          text(
            'idev-what',
            fig('water-cycle.svg', L('Esquema general del ciclo del agua', 'General scheme of the water cycle')) +
              p(
                L(
                  'El <strong>ciclo del agua</strong>, también llamado <em>ciclo hidrológico</em>, es el proceso por el cual el agua circula continuamente entre la atmósfera, la superficie terrestre y los océanos.',
                  'The <strong>water cycle</strong>, also called the <em>hydrological cycle</em>, is the process by which water moves continuously between the atmosphere, the land surface and the oceans.',
                ),
                V(
                  L(
                    'Esta circulación incesante es la que hace posible la vida en el planeta: sin ella no habría lluvia, ríos ni vegetación.',
                    'This endless circulation is what makes life on the planet possible: without it there would be no rain, rivers or vegetation.',
                  ),
                  L(
                    'Esta circulación incesante es la que hace posible la vida en el planeta: sin ella no habría lluvia, ríos, acuíferos ni vegetación.',
                    'This endless circulation is what makes life on the planet possible: without it there would be no rain, rivers, aquifers or vegetation.',
                  ),
                ),
                L(
                  'La cantidad total de agua de la Tierra apenas cambia: es la misma agua la que cambia de lugar y de estado una y otra vez.',
                  'The total amount of water on Earth hardly changes: it is the same water that changes place and state again and again.',
                ),
              ),
          ),
        ),
        box(
          'box-phases',
          V(L('Las cuatro fases', 'The four phases'), L('Las cinco fases', 'The five phases')),
          'objectives',
          text(
            'idev-phases',
            p(
              V(
                L('<strong>Las cuatro fases principales son:</strong>', '<strong>The four main phases are:</strong>'),
                L('<strong>Las cinco fases principales son:</strong>', '<strong>The five main phases are:</strong>'),
              ),
            ) +
              ol(...phases) +
              p(
                L(
                  'En las siguientes subpáginas desarrollarás cada fase con más detalle.',
                  'The following subpages look at each phase in more detail.',
                ),
              ),
          ),
        ),
      ],
    },
    {
      id: 'page-evaporation',
      parent: 'page-cycle',
      title: L('Evaporación', 'Evaporation'),
      boxes: [
        box(
          'box-evaporation',
          L('Del agua al vapor', 'From water to vapour'),
          'experiment',
          text(
            'idev-evaporation',
            fig(
              'evaporation.svg',
              L('El Sol calienta el agua y la transforma en vapor', 'The Sun heats the water and turns it into vapour'),
            ) +
              p(
                L(
                  'El calor del Sol hace que el agua de mares, ríos y lagos pase de estado líquido a <strong>vapor de agua</strong>, un gas invisible que asciende hacia la atmósfera.',
                  'The heat of the Sun makes the water of seas, rivers and lakes change from liquid to <strong>water vapour</strong>, an invisible gas that rises into the atmosphere.',
                ),
                V(
                  L(
                    'La mayor parte del agua que se evapora procede de los océanos.',
                    'Most of the water that evaporates comes from the oceans.',
                  ),
                  L(
                    'La mayor parte del agua que se evapora procede de los océanos, que cubren más de dos tercios de la superficie del planeta.',
                    'Most of the water that evaporates comes from the oceans, which cover more than two thirds of the surface of the planet.',
                  ),
                ),
                L(
                  'Cuanto más calor hace y más viento sopla, más rápida es la evaporación: por eso la ropa tendida se seca antes en un día soleado y ventoso.',
                  'The warmer and windier it is, the faster water evaporates: that is why washing dries sooner on a sunny, windy day.',
                ),
              ),
          ),
          ...(now
            ? [
                text(
                  'idev-transpiration',
                  p(
                    L(
                      'Las plantas también devuelven agua al aire: la absorben por las raíces y la liberan como vapor por las hojas. Este proceso se llama <strong>transpiración</strong>.',
                      'Plants also give water back to the air: they take it in through their roots and release it as vapour through their leaves. This process is called <strong>transpiration</strong>.',
                    ),
                  ),
                ),
              ]
            : []),
        ),
        box(
          'box-evaporation-try',
          L('Compruébalo', 'Try it yourself'),
          'observe',
          text(
            'idev-evaporation-try',
            ol(
              L('Llena dos platos con la misma cantidad de agua.', 'Fill two plates with the same amount of water.'),
              L('Deja uno al sol y otro a la sombra.', 'Leave one in the sun and the other in the shade.'),
              L(
                'Al cabo de unas horas, compara cuánta agua queda en cada uno.',
                'After a few hours, compare how much water is left in each.',
              ),
            ),
          ),
        ),
      ],
    },
    {
      id: 'page-condensation',
      parent: 'page-cycle',
      title: L('Condensación', 'Condensation'),
      boxes: [
        box(
          'box-condensation',
          L('Del vapor a las nubes', 'From vapour to clouds'),
          'nature',
          text(
            'idev-condensation',
            fig('condensation.svg', L('El vapor se enfría y forma nubes', 'The vapour cools down and forms clouds')) +
              p(
                L(
                  'Al subir, el vapor de agua se encuentra con aire más frío y se convierte en gotitas diminutas. Millones de estas gotitas juntas forman las <strong>nubes</strong>.',
                  'As it rises, water vapour meets colder air and turns into tiny droplets. Millions of these droplets together form <strong>clouds</strong>.',
                ),
                L(
                  'Es lo mismo que ocurre en el espejo del baño después de una ducha caliente, o en un vaso con hielo en verano.',
                  'It is the same thing that happens on the bathroom mirror after a hot shower, or on a glass of ice in summer.',
                ),
              ),
          ),
        ),
      ],
    },
    {
      id: 'page-precipitation',
      parent: 'page-cycle',
      title: L('Precipitación', 'Precipitation'),
      boxes: [
        box(
          'box-precipitation',
          L('El agua vuelve a caer', 'Water falls again'),
          'info',
          text(
            'idev-precipitation',
            fig(
              'precipitation.svg',
              L('Las nubes devuelven el agua a la superficie', 'Clouds return the water to the surface'),
            ) +
              p(
                L(
                  'Cuando las gotas de una nube se unen y pesan demasiado, caen. Según la temperatura del aire, la precipitación llega al suelo de formas distintas:',
                  'When the droplets of a cloud join together and become too heavy, they fall. Depending on the temperature of the air, precipitation reaches the ground in different forms:',
                ),
              ) +
              ul(
                L('<strong>Lluvia:</strong> gotas de agua líquida.', '<strong>Rain:</strong> drops of liquid water.'),
                ...(now
                  ? [
                      L(
                        '<strong>Llovizna:</strong> gotas muy finas que caen despacio.',
                        '<strong>Drizzle:</strong> very fine drops that fall slowly.',
                      ),
                    ]
                  : []),
                L(
                  '<strong>Granizo:</strong> bolas de hielo que se forman en nubes de tormenta.',
                  '<strong>Hail:</strong> balls of ice that form in storm clouds.',
                ),
                L(
                  '<strong>Nieve:</strong> cristales de hielo que caen cuando hace mucho frío.',
                  '<strong>Snow:</strong> ice crystals that fall when it is very cold.',
                ),
              ),
          ),
        ),
        ...(now
          ? []
          : [
              box(
                'box-rain-gauge',
                L('¿Cómo se mide la lluvia?', 'How is rain measured?'),
                'calculate',
                text(
                  'idev-rain-gauge',
                  p(
                    L(
                      'La lluvia se mide con un <strong>pluviómetro</strong>. Un litro de agua por metro cuadrado equivale a un milímetro de lluvia.',
                      'Rain is measured with a <strong>rain gauge</strong>. One litre of water per square metre equals one millimetre of rain.',
                    ),
                  ),
                ),
              ),
            ]),
      ],
    },
    ...(now
      ? [
          {
            id: 'page-infiltration',
            parent: 'page-cycle',
            title: L('Infiltración', 'Infiltration'),
            boxes: [
              box(
                'box-infiltration',
                L('El agua que no vemos', 'The water we do not see'),
                'explore',
                text(
                  'idev-infiltration',
                  fig('aquifer.svg', L('El agua se filtra hasta el acuífero', 'Water seeps down to the aquifer')) +
                    p(
                      L(
                        'No toda el agua de la lluvia corre por la superficie. Una parte se filtra entre la tierra y las rocas hasta acumularse bajo el suelo, en los <strong>acuíferos</strong>.',
                        'Not all rainwater runs over the surface. Part of it seeps between soil and rocks until it gathers under the ground, in <strong>aquifers</strong>.',
                      ),
                      L(
                        'Esa agua subterránea avanza muy despacio y vuelve a salir en manantiales y fuentes, o se extrae con pozos.',
                        'That groundwater moves very slowly and comes out again in springs, or is drawn up through wells.',
                      ),
                    ),
                ),
              ),
              box(
                'box-infiltration-measure',
                L('¿Cómo se mide la lluvia?', 'How is rain measured?'),
                'calculate',
                text(
                  'idev-rain-gauge',
                  p(
                    L(
                      'La lluvia se mide con un <strong>pluviómetro</strong>. Un litro de agua por metro cuadrado equivale a un milímetro de lluvia.',
                      'Rain is measured with a <strong>rain gauge</strong>. One litre of water per square metre equals one millimetre of rain.',
                    ),
                    L(
                      'Saber cuánto llueve ayuda a calcular cuánta agua llega a los acuíferos.',
                      'Knowing how much it rains helps to work out how much water reaches the aquifers.',
                    ),
                  ),
                ),
              ),
            ],
          },
        ]
      : []),
    {
      id: 'page-collection',
      parent: 'page-cycle',
      title: V(L('Recogida', 'Collection'), L('Escorrentía y recogida', 'Runoff and collection')),
      boxes: [
        box(
          'box-collection',
          L('De vuelta al mar', 'Back to the sea'),
          'geography',
          text(
            'idev-collection',
            fig(
              'collection.svg',
              L('El agua se reúne en ríos, lagos y océanos', 'Water gathers in rivers, lakes and oceans'),
            ) +
              p(
                V(
                  L(
                    'El agua que cae sobre la tierra corre por la superficie, forma arroyos y ríos y acaba en lagos, embalses y océanos.',
                    'The water that falls on land runs over the surface, forms streams and rivers and ends up in lakes, reservoirs and oceans.',
                  ),
                  L(
                    'El agua que cae sobre la tierra y no se filtra corre por la superficie: es la <strong>escorrentía</strong>. Forma arroyos y ríos y acaba en lagos, embalses y océanos.',
                    'The water that falls on land and does not seep in runs over the surface: this is <strong>runoff</strong>. It forms streams and rivers and ends up in lakes, reservoirs and oceans.',
                  ),
                ),
                L(
                  'Allí el Sol vuelve a calentarla y el ciclo empieza de nuevo.',
                  'There the Sun heats it again and the cycle starts once more.',
                ),
              ),
          ),
        ),
      ],
    },
    {
      id: 'page-islands',
      title: L('El agua en Canarias', 'Water in the Canary Islands'),
      boxes: [
        box(
          'box-islands',
          L('Islas que atrapan nubes', 'Islands that catch clouds'),
          'geography',
          text(
            'idev-islands',
            fig(
              'islands.svg',
              L('Una isla alta detiene las nubes que trae el viento', 'A high island stops the clouds the wind brings'),
            ) +
              p(
                L(
                  'Los vientos alisios empujan aire húmedo contra las laderas del norte de las islas más altas. Al subir, ese aire se enfría y forma el <strong>mar de nubes</strong>.',
                  'The trade winds push moist air against the northern slopes of the highest islands. As it rises, that air cools down and forms the <strong>sea of clouds</strong>.',
                ),
                L(
                  'Las hojas de los árboles atrapan las gotitas de la niebla, que escurren hasta el suelo. Es la <strong>lluvia horizontal</strong>, que da agua al bosque aunque no llueva.',
                  'The leaves of the trees catch the droplets of the fog, which drip down to the ground. This is <strong>horizontal rain</strong>, which waters the forest even when it does not rain.',
                ),
              ),
          ),
        ),
        box(
          'box-islands-supply',
          L('¿De dónde sale el agua del grifo?', 'Where does tap water come from?'),
          'ask',
          text(
            'idev-islands-supply',
            ul(
              L(
                '<strong>Galerías y pozos</strong>, que sacan el agua de los acuíferos.',
                '<strong>Galleries and wells</strong>, which draw water from the aquifers.',
              ),
              L(
                '<strong>Presas y balsas</strong>, que guardan el agua de la lluvia.',
                '<strong>Dams and ponds</strong>, which store rainwater.',
              ),
              V(
                L(
                  '<strong>Desaladoras</strong>, que quitan la sal al agua del mar.',
                  '<strong>Desalination plants</strong>, which take the salt out of sea water.',
                ),
                L(
                  '<strong>Desaladoras</strong>, que quitan la sal al agua del mar y son la fuente principal en las islas más secas.',
                  '<strong>Desalination plants</strong>, which take the salt out of sea water and are the main source on the driest islands.',
                ),
              ),
            ),
          ),
        ),
      ],
    },
    {
      id: 'page-activities',
      title: L('Actividades', 'Activities'),
      boxes: [
        box(
          'box-activities',
          L('Comprueba lo aprendido', 'Check what you have learned'),
          'activity',
          text(
            'idev-activities',
            fig('activities.svg', L('Dos actividades para repasar', 'Two activities to review')) +
              p(
                L(
                  'En las dos subpáginas siguientes encontrarás una actividad para ordenar las fases y otra de verdadero o falso.',
                  'On the next two subpages you will find an activity to put the phases in order and a true or false one.',
                ),
              ),
          ),
        ),
      ],
    },
    {
      id: 'page-order',
      parent: 'page-activities',
      title: L('Ordena las fases', 'Put the phases in order'),
      boxes: [
        box(
          'box-order-intro',
          L('Antes de empezar', 'Before you start'),
          'info',
          text(
            'idev-order-intro',
            fig('order.svg', L('Ordena las fases del ciclo', 'Put the phases of the cycle in order')) +
              p(
                L(
                  'Arrastra cada paso hasta dejar las fases en el <strong>orden natural</strong> en el que se producen.',
                  'Drag each step until the phases are in the <strong>natural order</strong> in which they happen.',
                ),
              ),
          ),
        ),
        box(
          'box-order',
          L('Ordena', 'Sort'),
          'interactive',
          order(
            'idev-order',
            L(
              'Coloca las fases del ciclo del agua en su orden correcto.',
              'Put the phases of the water cycle in the right order.',
            ),
            [
              L(
                'Evaporación: el calor del Sol hace que el agua se evapore.',
                'Evaporation: the heat of the Sun makes water evaporate.',
              ),
              L(
                'Condensación: el vapor sube y se condensa formando nubes.',
                'Condensation: the vapour rises and condenses into clouds.',
              ),
              L(
                'Precipitación: el agua vuelve a caer como lluvia o nieve.',
                'Precipitation: water falls again as rain or snow.',
              ),
              ...(now
                ? [
                    L(
                      'Infiltración: parte del agua se filtra en el suelo.',
                      'Infiltration: part of the water seeps into the ground.',
                    ),
                  ]
                : []),
              L(
                'Recogida: el agua se acumula en ríos, lagos y océanos.',
                'Collection: water gathers in rivers, lakes and oceans.',
              ),
            ],
          ),
        ),
      ],
    },
    {
      id: 'page-true-or-false',
      parent: 'page-activities',
      title: L('¿Verdadero o falso?', 'True or false?'),
      boxes: [
        box(
          'box-tof-intro',
          L('Antes de empezar', 'Before you start'),
          'info',
          text(
            'idev-tof-intro',
            fig(
              'true-or-false.svg',
              L('Decide si cada afirmación es verdadera o falsa', 'Decide whether each statement is true or false'),
            ) +
              p(
                L(
                  'Lee cada afirmación y decide si es <strong>verdadera</strong> o <strong>falsa</strong>.',
                  'Read each statement and decide whether it is <strong>true</strong> or <strong>false</strong>.',
                ),
              ),
          ),
        ),
        box(
          'box-tof',
          L('Responde', 'Answer'),
          'interactive',
          trueOrFalse('idev-tof', L('Marca V o F según corresponda.', 'Mark each one as true or false.'), [
            [
              L(
                'El Sol es la principal fuente de energía del ciclo del agua.',
                'The Sun is the main source of energy of the water cycle.',
              ),
              L('Correcto. Sin el Sol no habría evaporación.', 'Right. Without the Sun there would be no evaporation.'),
              1,
            ],
            [
              L(
                'La condensación consiste en que el agua líquida se convierte en vapor.',
                'Condensation is liquid water turning into vapour.',
              ),
              L(
                'Falso. Eso es la evaporación. La condensación es el paso contrario.',
                'False. That is evaporation. Condensation is the opposite step.',
              ),
              0,
            ],
            [
              L('La nieve también es una forma de precipitación.', 'Snow is also a form of precipitation.'),
              V(
                L(
                  'Correcto. Lluvia, granizo y nieve son precipitaciones.',
                  'Right. Rain, hail and snow are all precipitation.',
                ),
                L(
                  'Correcto. Lluvia, llovizna, granizo y nieve son precipitaciones.',
                  'Right. Rain, drizzle, hail and snow are all precipitation.',
                ),
              ),
              1,
            ],
            [
              L(
                'El ciclo del agua comienza y acaba siempre en los océanos.',
                'The water cycle always starts and ends in the oceans.',
              ),
              L(
                'No del todo: es un ciclo continuo sin principio ni fin claros.',
                'Not quite: it is a continuous cycle with no clear beginning or end.',
              ),
              0,
            ],
            ...(now
              ? [
                  [
                    L('Toda el agua de la lluvia acaba en los ríos.', 'All rainwater ends up in rivers.'),
                    L(
                      'Falso. Una parte se filtra en el suelo y otra se evapora.',
                      'False. Part of it seeps into the ground and part evaporates.',
                    ),
                    0,
                  ] as [string, string, 0 | 1],
                ]
              : []),
          ]),
        ),
      ],
    },
    ...(now
      ? []
      : [
          {
            id: 'page-facts',
            title: L('Curiosidades', 'Fun facts'),
            boxes: [
              box(
                'box-facts',
                L('¿Sabías que…?', 'Did you know…?'),
                'think',
                text(
                  'idev-facts',
                  ul(
                    L(
                      'Casi toda el agua de la Tierra es salada: solo unas tres de cada cien partes son agua dulce.',
                      'Almost all the water on Earth is salty: only about three parts in a hundred are fresh water.',
                    ),
                    L(
                      'La mayor parte del agua dulce está helada en los polos y los glaciares.',
                      'Most fresh water is frozen at the poles and in glaciers.',
                    ),
                    L(
                      'El agua que bebes hoy lleva millones de años dando vueltas por el planeta.',
                      'The water you drink today has been travelling around the planet for millions of years.',
                    ),
                  ),
                ),
              ),
            ],
          },
        ]),
    {
      id: 'page-glossary',
      title: L('Glosario', 'Glossary'),
      boxes: [
        box(
          'box-glossary',
          L('Palabras clave', 'Key words'),
          'letters',
          text(
            'idev-glossary',
            ul(
              ...(now
                ? [
                    L(
                      '<strong>Acuífero:</strong> capa de roca o tierra que guarda agua bajo el suelo.',
                      '<strong>Aquifer:</strong> layer of rock or soil that holds water under the ground.',
                    ),
                  ]
                : []),
              L(
                '<strong>Atmósfera:</strong> capa de gases que rodea la Tierra.',
                '<strong>Atmosphere:</strong> layer of gases that surrounds the Earth.',
              ),
              L(
                '<strong>Condensación:</strong> paso del agua de gas a líquido.',
                '<strong>Condensation:</strong> change of water from gas to liquid.',
              ),
              ...(now
                ? [
                    L(
                      '<strong>Escorrentía:</strong> agua de lluvia que corre por la superficie.',
                      '<strong>Runoff:</strong> rainwater that runs over the surface.',
                    ),
                  ]
                : []),
              L(
                '<strong>Evaporación:</strong> paso del agua de líquido a gas.',
                '<strong>Evaporation:</strong> change of water from liquid to gas.',
              ),
              V(
                L(
                  '<strong>Precipitación:</strong> agua que cae de las nubes.',
                  '<strong>Precipitation:</strong> water that falls from the clouds.',
                ),
                L(
                  '<strong>Precipitación:</strong> agua que cae de las nubes, líquida o helada.',
                  '<strong>Precipitation:</strong> water that falls from the clouds, liquid or frozen.',
                ),
              ),
              L(
                '<strong>Vapor de agua:</strong> agua en estado gaseoso, invisible.',
                '<strong>Water vapour:</strong> water as a gas, invisible.',
              ),
            ),
          ),
        ),
      ],
    },
    {
      id: 'page-resources',
      title: L('Recursos', 'Resources'),
      boxes: [
        box(
          'box-resources',
          L('Para saber más', 'Find out more'),
          'share',
          text(
            'idev-resources',
            fig('resources.svg', L('Enlaces para seguir aprendiendo', 'Links to keep learning')) +
              p(
                L(
                  'Estos recursos te ayudarán a profundizar en el ciclo del agua:',
                  'These resources will help you go deeper into the water cycle:',
                ),
              ) +
              ul(
                `<a href="${L('https://es.wikipedia.org/wiki/Ciclo_hidrol%C3%B3gico', 'https://en.wikipedia.org/wiki/Water_cycle')}" target="_blank" rel="noopener">${L('El ciclo hidrológico en Wikipedia', 'The water cycle on Wikipedia')}</a>`,
                `<a href="https://www.usgs.gov/special-topics/water-science-school" target="_blank" rel="noopener">${L('Escuela de ciencias del agua del USGS (en inglés)', 'USGS Water Science School')}</a>`,
                ...(now
                  ? [
                      `<a href="${L('https://es.wikipedia.org/wiki/Lluvia_horizontal', 'https://en.wikipedia.org/wiki/Fog_drip')}" target="_blank" rel="noopener">${L('La lluvia horizontal en Wikipedia', 'Fog drip on Wikipedia')}</a>`,
                    ]
                  : []),
              ),
          ),
        ),
      ],
    },
    {
      id: 'page-credits',
      title: L('Créditos', 'Credits'),
      boxes: [
        box(
          'box-credits',
          L('Sobre este recurso', 'About this resource'),
          'info',
          text(
            'idev-credits',
            fig('credits.svg', L('Créditos', 'Credits')) +
              p(
                L(
                  'Recurso de ejemplo de <strong>elpx-diff</strong>, adaptado y ampliado a partir del ejemplo del estilo <em>ATE</em> para eXeLearning, del Área de Tecnología Educativa del Gobierno de Canarias.',
                  'Example resource of <strong>elpx-diff</strong>, adapted and extended from the example of the <em>ATE</em> style for eXeLearning, by the Área de Tecnología Educativa of the Government of the Canary Islands.',
                ),
                L(
                  'El contenido y las ilustraciones se publican en dominio público (CC0). El estilo es el estilo base de eXeLearning, bajo la licencia <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">Creative Commons BY-SA 4.0</a>.',
                  'The content and the illustrations are in the public domain (CC0). The style is the base style of eXeLearning, under the <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">Creative Commons BY-SA 4.0</a> licence.',
                ),
              ),
          ),
        ),
      ],
    },
  ];

  return {
    lang,
    title: V(
      L('El ciclo del agua', 'The water cycle'),
      L('El ciclo del agua · 2.ª edición', 'The water cycle · 2nd edition'),
    ),
    description: V(
      L('Recurso educativo de ejemplo sobre el ciclo del agua.', 'Example educational resource on the water cycle.'),
      L(
        'Recurso educativo de ejemplo sobre el ciclo del agua, con la infiltración y las aguas subterráneas.',
        'Example educational resource on the water cycle, with infiltration and groundwater.',
      ),
    ),
    pages,
    images,
  };
}

const AUTHOR = 'Área de Tecnología Educativa · Gobierno de Canarias';
const LICENCE = 'https://creativecommons.org/publicdomain/zero/1.0/';

/** content.xml, with the fields eXeLearning 4 writes. */
function contentXml(r: Resource, version: number): string {
  const list = (tag: string, values: Record<string, string>, indent = ''): string =>
    Object.entries(values)
      .map(
        ([key, value]) =>
          `${indent}<${tag}>\n${indent}  <key>${key}</key>\n${indent}  <value>${esc(value)}</value>\n${indent}</${tag}>`,
      )
      .join('\n');
  const shown = { visibility: 'true', teacherOnly: 'false' };
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ode SYSTEM "content.dtd">
<ode xmlns="http://www.intef.es/xsd/ode" version="2.0">
<userPreferences>
${list('userPreference', { theme: 'base' }, '  ')}
</userPreferences>
<odeResources>
${list('odeResource', { odeId: `20260101000000ELPX${r.lang.toUpperCase()}`, odeVersionId: `2026010100000${version}ELPX${r.lang.toUpperCase()}`, exe_version: '4.0.6' }, '  ')}
</odeResources>
<odeProperties>
${list(
  'odeProperty',
  {
    pp_title: r.title,
    pp_author: AUTHOR,
    pp_description: r.description,
    pp_lang: r.lang,
    pp_license: 'creative commons: cc0 1.0',
    pp_licenseUrl: LICENCE,
    pp_theme: 'base',
    pp_exelearning_version: 'v4.0.6',
    pp_modified: String(Date.UTC(2026, 0, version)),
    pp_addExeLink: 'true',
    pp_addPagination: 'true',
    pp_addSearchBox: 'false',
    pp_addAccessibilityToolbar: 'false',
    pp_addMathJax: 'false',
    exportSource: 'true',
    pp_globalFont: 'default',
  },
  '  ',
)}
</odeProperties>
<odeNavStructures>
${r.pages
  .map(
    (page, n) => `<odeNavStructure>
  <odePageId>${page.id}</odePageId>
  <odeParentPageId>${page.parent ?? ''}</odeParentPageId>
  <pageName>${esc(page.title)}</pageName>
  <odeNavStructureOrder>${n}</odeNavStructureOrder>
  <odeNavStructureProperties>
${list('odeNavStructureProperty', { titlePage: page.title, visibility: 'true', highlight: 'false', hidePageTitle: 'false', editableInPage: 'false', titleNode: page.title, titleHtml: '', description: '' }, '    ')}
  </odeNavStructureProperties>
  <odePagStructures>
${page.boxes
  .map(
    (box, b) => `    <odePagStructure>
      <odePageId>${page.id}</odePageId>
      <odeBlockId>${box.id}</odeBlockId>
      <blockName>${esc(box.title)}</blockName>
      <iconName>${box.icon}</iconName>
      <odePagStructureOrder>${b + 1}</odePagStructureOrder>
      <odePagStructureProperties>
${list('odePagStructureProperty', { ...shown, allowToggle: 'true', minimized: 'false', cssClass: '' }, '        ')}
      </odePagStructureProperties>
      <odeComponents>
${box.idevices
  .map(
    (idevice, i) => `        <odeComponent>
          <odePageId>${page.id}</odePageId>
          <odeBlockId>${box.id}</odeBlockId>
          <odeIdeviceId>${idevice.id}</odeIdeviceId>
          <odeIdeviceTypeName>${idevice.type}</odeIdeviceTypeName>
          <htmlView><![CDATA[${idevice.html}]]></htmlView>
          <jsonProperties><![CDATA[${JSON.stringify(idevice.json)}]]></jsonProperties>
          <odeComponentsOrder>${i + 1}</odeComponentsOrder>
          <odeComponentsProperties>
${list('odeComponentsProperty', { ...shown, cssClass: '' }, '            ')}
          </odeComponentsProperties>
        </odeComponent>`,
  )
  .join('\n')}
      </odeComponents>
    </odePagStructure>`,
  )
  .join('\n')}
  </odePagStructures>
</odeNavStructure>`,
  )
  .join('\n')}
</odeNavStructures>
</ode>
`;
}

/** Where each page is exported: index.html for the first one, html/<name>.html for the rest. */
const pathOf = (r: Resource, page: Page): string =>
  page === r.pages[0] ? 'index.html' : `html/${slug(page.title)}.html`;

/** One exported page, as eXeLearning 4 writes it with this style. */
function pageHtml(r: Resource, page: Page): string {
  const L = (es: string, en: string): string => (r.lang === 'es' ? es : en);
  const n = r.pages.indexOf(page);
  const up = n === 0 ? '' : '../';
  const href = (to: Page): string => up + pathOf(r, to);
  const parents = new Set<string>();
  for (let at: Page | undefined = page; at?.parent; at = r.pages.find((one) => one.id === at!.parent))
    parents.add(at.parent);
  const nav = (parent?: string): string => {
    const children = r.pages.filter((one) => one.parent === parent);
    if (children.length === 0) return '';
    return `<ul${parent ? ' class="other-section"' : ''}>\n${children
      .map((child) => {
        const active = child === page;
        const state = active ? ' class="active"' : parents.has(child.id) ? ' class="current-page-parent"' : '';
        const kind = [
          active && 'active',
          child === r.pages[0] && 'main-node',
          r.pages.some((one) => one.parent === child.id) ? 'daddy' : 'no-ch',
        ];
        return `<li${state}> <a href="${href(child)}" class="${kind.filter(Boolean).join(' ')}">${esc(child.title)}</a>\n${nav(child.id)}</li>`;
      })
      .join('\n')}\n</ul>\n`;
  };
  const types = [...new Set(['text', ...page.boxes.flatMap((box) => box.idevices.map((idevice) => idevice.type))])];
  const [previous, next] = [r.pages[n - 1], r.pages[n + 1]];
  return `<!DOCTYPE html>
<html lang="${r.lang}" id="${n === 0 ? 'exe-index' : `exe-${page.id}`}">
<head>
<meta charset="utf-8">
<meta name="generator" content="eXeLearning">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="license" type="text/html" href="${LICENCE}">
<title>${esc(n === 0 ? r.title : `${page.title} | ${r.title}`)}</title>
<link rel="icon" type="image/x-icon" href="${up}libs/favicon.ico">
<meta name="description" content="${esc(r.description)}">
<script>document.querySelector("html").classList.add("js");</script><script src="${up}libs/jquery/jquery.min.js"> </script><script src="${up}libs/common_i18n.js"> </script><script src="${up}libs/common.js"> </script><script src="${up}libs/exe_export.js"> </script><script src="${up}libs/bootstrap/bootstrap.bundle.min.js"> </script><link rel="stylesheet" href="${up}libs/bootstrap/bootstrap.min.css">
${types.map((type) => `<script src="${up}idevices/${type}/${type}.js"></script><link rel="stylesheet" href="${up}idevices/${type}/${type}.css">`).join('\n')}
<link rel="stylesheet" href="${up}content/css/base.css"><script src="${up}theme/style.js"> </script><link rel="stylesheet" href="${up}theme/style.css">
</head>
<body class="exe-export exe-web-site">
<script>document.body.className+=" js"</script>
<div class="exe-content exe-export pre-js siteNav-hidden"><a href="#${page.id}" id="skipNav">${L('Saltar al contenido', 'Skip to content')}</a> <nav id="siteNav">
${nav()}</nav><main id="${page.id}" class="page">
<header class="main-header"> <p class="page-counter"> <span class="page-counter-label">${L('Página', 'Page')} </span><span class="page-counter-content"> <strong class="page-counter-current-page">${n + 1}</strong><span class="page-counter-sep">/</span><strong class="page-counter-total">${r.pages.length}</strong></span></p>

<div class="package-header"><p class="package-title">${esc(r.title)}</p></div>
<div class="page-header"><h1 class="page-title">${esc(page.title)}</h1></div>
</header><div id="page-content-${page.id}" class="page-content">
${page.boxes
  .map(
    (box) => `<article id="${box.id}" class="box">
<header class="box-head">
<div class="box-icon exe-icon">
<img src="${up}theme/icons/${box.icon}.png" alt="" style="display:block;object-fit:contain;">
</div>
<h1 class="box-title">${esc(box.title)}</h1>
<button class="box-toggle box-toggle-on" title="Toggle content">
<span>Toggle content</span>
</button></header>
<div class="box-content">
${box.idevices
  .map(
    (idevice) =>
      `<div id="${idevice.id}" class="idevice_node ${idevice.type}" data-idevice-path="${up}idevices/${idevice.type}/" data-idevice-type="${idevice.type}" data-idevice-component-type="json" data-idevice-json-data="${esc(JSON.stringify(idevice.type === 'text' ? { ideviceId: idevice.id } : idevice.json))}"${idevice.type === 'text' ? '' : ` data-idevice-template="${idevice.type}.html"`}>
${idevice.html.replaceAll('{{context_path}}/', up)}
</div>`,
  )
  .join('\n')}
</div>
</article>`,
  )
  .join('')}
</div></main><div class="nav-buttons">
${previous ? `<a href="${href(previous)}" title="${L('Anterior', 'Previous')}" class="nav-button nav-button-left"><span>${L('Anterior', 'Previous')}</span></a>` : `<span class="nav-button nav-button-left" aria-hidden="true"><span>${L('Anterior', 'Previous')}</span></span>`}
${next ? `<a href="${href(next)}" title="${L('Siguiente', 'Next')}" class="nav-button nav-button-right"><span>${L('Siguiente', 'Next')}</span></a>` : `<span class="nav-button nav-button-right" aria-hidden="true"><span>${L('Siguiente', 'Next')}</span></span>`}
</div>
<footer id="siteFooter"><div id="siteFooterContent"> <div id="packageLicense" class="cc cc-0"> <p> <span class="license-label">${L('Licencia', 'Licence')}: </span><a href="${LICENCE}" class="license">${L('Creative Commons: CC0 1.0 Universal (dominio público)', 'Creative Commons: CC0 1.0 Universal (public domain)')}</a></p>
</div>
</div></footer>
</div>
<p id="made-with-eXe"> <a href="https://exelearning.net/" target="_blank" rel="noopener"> <span>${L('Creado con eXeLearning', 'Made with eXeLearning')} <span>(${L('Ventana nueva', 'New window')})</span></span></a></p>
</body>
</html>
`;
}

// The strings of eXeLearning's own scripts that a reader of the English version can come across.
const ENGLISH = {
  previous: 'Previous',
  next: 'Next',
  menu: 'Menu',
  show: 'Show',
  hide: 'Hide',
  toggleContent: 'Hide/Show content',
  showFeedback: 'Show feedback',
  hideFeedback: 'Hide feedback',
  correct: 'Right',
  incorrect: 'Wrong',
  yourScoreIs: 'Your score',
  solution: 'Solution',
  download: 'Download',
  print: 'Print',
  search: 'Search',
  dataError: 'Data error',
  block: 'box',
  more: 'More',
  newWindow: 'New window',
  fullSize: 'Full size',
  drag_and_drop: 'Drag',
  reset: 'Reset',
};

if (!existsSync(BASE)) {
  await $`git clone -q ${STYLE} ${BASE}`;
  await $`git -C ${BASE} checkout -q ${COMMIT}`;
}
if (!existsSync(EXE)) {
  await $`git clone -q --depth 1 --filter=blob:none --sparse --branch v4.0.6 https://github.com/exelearning/exelearning.git ${EXE}`;
  await $`git -C ${EXE} sparse-checkout set public/files/perm/themes/base/base`;
}
// What every version carries: the scripts of its pages and of its iDevices, and eXeLearning's base style.
const shared: Record<string, Uint8Array> = {};
const kept =
  /^(content\.dtd|content\/(css|img)\/|libs\/(jquery|bootstrap)\/|libs\/(common|common_i18n|exe_export)\.js$|libs\/favicon\.ico$|idevices\/(text|scrambled-list|trueorfalse)\/)/;
for (const path of (readdirSync(BASE, { recursive: true }) as string[]).sort()) {
  if (kept.test(path) && statSync(`${BASE}/${path}`).isFile()) shared[path] = readFileSync(`${BASE}/${path}`);
}
for (const path of (readdirSync(THEME, { recursive: true }) as string[]).sort()) {
  if (path !== 'screenshot.png' && statSync(`${THEME}/${path}`).isFile())
    shared[`theme/${path}`] = readFileSync(`${THEME}/${path}`);
}
if (!shared['theme/style.css'] || !shared['libs/common.js']) throw new Error('the style is not where it was');

mkdirSync(OUT, { recursive: true });
for (const [lang, name] of [
  ['es', 'ciclo-del-agua'],
  ['en', 'water-cycle'],
] as const) {
  for (const version of [1, 2] as const) {
    const r = resource(lang, version);
    const files: Record<string, Uint8Array> = { 'content.xml': strToU8(contentXml(r, version)), ...shared };
    if (lang === 'en') files['libs/common_i18n.js'] = strToU8(`$exe_i18n = ${JSON.stringify(ENGLISH, null, 2)};\n`);
    for (const page of r.pages) files[pathOf(r, page)] = strToU8(pageHtml(r, page));
    for (const [image, svg] of Object.entries(r.images)) files[`content/resources/${image}`] = strToU8(svg);
    // A fixed date, so writing them again changes nothing when the content did not change.
    const bytes = zipSync(files, { level: 9, mtime: new Date(2026, 0, 1) });
    await Bun.write(`${OUT}/${name}-v${version}.elpx`, bytes);
    console.log(`${OUT}/${name}-v${version}.elpx: ${r.pages.length} pages, ${Math.round(bytes.length / 1024)} KB`);
  }
}
