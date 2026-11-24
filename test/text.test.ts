import { expect, test } from 'bun:test';

import { decryptDataGame, htmlToLines, ideviceLines, jsonToLines } from '../src/text.js';

const encrypt = (value: unknown): string =>
  escape([...JSON.stringify(value)].map((c) => String.fromCharCode(c.charCodeAt(0) ^ 146)).join(''));

test('one line per block element, entities decoded, whitespace collapsed', () => {
  expect(
    htmlToLines('<h2>T&iacute;tulo</h2><p>Uno   <b>dos</b><br>tres</p><ul><li>a</li><li>b &amp; c</li></ul>'),
  ).toEqual(['Título', 'Uno dos', 'tres', 'a', 'b & c']);
  expect(htmlToLines('')).toEqual([]);
  expect(htmlToLines('sin etiquetas')).toEqual(['sin etiquetas']);
});

test('scripts, styles and comments are dropped', () => {
  expect(
    htmlToLines('<p>a</p><script>alert("<p>x</p>")</script><style>p{color:red}</style><!-- <p>no</p> --><p>b</p>'),
  ).toEqual(['a', 'b']);
});

test('links show their target, except anchors and empty ones', () => {
  expect(htmlToLines('<a href="https://x.org">enlace</a>')).toEqual(['enlace ‹https://x.org›']);
  expect(htmlToLines("<a href='{{context_path}}/content/resources/guia.pdf'>guía</a>")).toEqual(['guía ‹guia.pdf›']);
  expect(htmlToLines('<a href="#top">arriba</a> <a>nada</a> <a name=x>ancla</a>')).toEqual(['arriba nada ancla']);
  expect(htmlToLines('texto</a> suelto')).toEqual(['texto suelto']); // a stray closing tag
});

test('images and media become visible markers', () => {
  expect(htmlToLines('<img src="{{context_path}}/content/resources/a.png" alt="Foto" title="a > b">')).toEqual([
    '[img: a.png — Foto]',
  ]);
  expect(htmlToLines('<img src=b.png>')).toEqual(['[img: b.png]']);
  expect(htmlToLines('<video controls><source src="v.mp4"><track src="s.vtt"></video>')).toEqual([
    '[media: v.mp4]',
    '[track: s.vtt]',
  ]);
  expect(htmlToLines('<audio src="a.mp3"></audio><iframe src="https://y.tv/1"></iframe>')).toEqual([
    '[audio: a.mp3]',
    '[iframe: https://y.tv/1]',
  ]);
  expect(htmlToLines('<object data="doc.pdf"></object><embed src="e.swf">')).toEqual([
    '[media: doc.pdf]',
    '[media: e.swf]',
  ]);
});

test('JSON strings in document order, without ids, interface messages or non-text', () => {
  expect(
    jsonToLines({
      ideviceId: 'x1',
      id: 'x2',
      title: 'Hola',
      msgs: { ok: 'Bien' },
      n: 3,
      on: true,
      none: null,
      list: ['<p>Uno</p><p>Dos</p>', '123', { deep: 'Tres' }],
    }),
  ).toEqual(['Hola', 'Uno', 'Dos', 'Tres']);
});

test('game data: obfuscated or plain JSON, unreadable data ignored', () => {
  expect(decryptDataGame(encrypt({ a: 'ñ€' }))).toBe('{"a":"ñ€"}'); // %XX and %uXXXX
  const data = { question: '¿Capital?', msgs: { ok: 'Bien' } };
  expect(ideviceLines(`<p>Juego</p><div class="quiz-DataGame js-hidden">${encrypt(data)}</div>`, '')).toEqual([
    'Juego',
    '¿Capital?',
  ]);
  expect(ideviceLines(`<div class='quiz-DataGame'>${JSON.stringify(data).replace(/"/g, '&quot;')}</div>`, '')).toEqual([
    '¿Capital?',
  ]);
  expect(ideviceLines('<p>Juego</p><div class="quiz-DataGame">%%%</div>', '')).toEqual(['Juego']);
});

test('iDevices without HTML use their JSON properties', () => {
  expect(ideviceLines('', '{"ideviceId":"x1","eXeFormInstructions":"<p>Completa</p>","n":3}')).toEqual(['Completa']);
  expect(ideviceLines('', '<p>no es JSON</p>')).toEqual(['no es JSON']);
  expect(ideviceLines('<p>HTML</p>', '{"textTextarea":"<p>JSON</p>"}')).toEqual(['HTML']); // the HTML wins: the JSON repeats it
  expect(ideviceLines('', '  ')).toEqual([]);
});
