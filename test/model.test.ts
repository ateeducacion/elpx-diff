import { expect, test } from 'bun:test';

import { loadProject } from '../src/model.js';
import { contentXml, elpx, v1, zip } from './helpers.js';

test('reads metadata, pages, boxes, iDevices and resources', async () => {
  const project = await loadProject(v1());
  expect(project.title).toBe('Recurso');
  expect(project.pages.map((p) => [p.id, p.title, p.depth])).toEqual([
    ['p1', 'Unidad 1 — Introducción', 0],
    ['p2', 'Unidad 2', 0],
  ]);
  const block = project.pages[0]!.blocks[1]!;
  expect(block).toMatchObject({ id: 'b2', name: 'Actividad de evaluación' });
  expect(block.idevices[0]).toEqual({
    id: 'i2',
    type: 'text',
    lines: ['¿Cuál es la capital de España?', 'Elige una.'],
    raw: '<p>¿Cuál es la capital de España?</p><p>Elige una.</p>',
  });
  expect([...project.resources.keys()]).toEqual(['content/resources/mapa.png', 'content/resources/guia.pdf']); // index.html is generated, not a resource
  expect(project.resources.get('content/resources/mapa.png')!.size).toBe(3);
});

test('accepts a Blob as well as bytes', async () => {
  expect((await loadProject(new Blob([v1() as Uint8Array<ArrayBuffer>]))).pages).toHaveLength(2);
});

test('pages come in navigation order: tree from the parent ids, siblings by their order', async () => {
  const xml = `<ode><odeNavStructures>${[
    ['c', 'a', 1, 'Nieta'],
    ['b', '', 1, 'Segunda'],
    ['a', '', 0, 'Primera'],
    ['d', 'a', 0, 'Hija'],
    ['e', 'gone', 5, 'Huérfana'],
    ['x', 'y', 0, 'Ciclo 1'],
    ['y', 'x', 0, 'Ciclo 2'],
  ]
    .map(
      ([id, parent, order, name]) =>
        `<odeNavStructure><odePageId>${id}</odePageId><odeParentPageId>${parent}</odeParentPageId><pageName>${name}</pageName><odeNavStructureOrder>${order}</odeNavStructureOrder></odeNavStructure>`,
    )
    .join('')}</odeNavStructures></ode>`;
  const project = await loadProject(zip({ 'content.xml': xml }));
  // A page whose parent does not exist is a root; pages only reachable through a cycle are left out.
  expect(project.pages.map((p) => `${'>'.repeat(p.depth)}${p.title}`)).toEqual([
    'Primera',
    '>Hija',
    '>Nieta',
    'Segunda',
    'Huérfana',
  ]);
  expect(project.title).toBe('');
});

test('boxes and iDevices follow their order fields, not the order in the file', async () => {
  const xml = `<ode><odeNavStructures><odeNavStructure><odePageId>p</odePageId><pageName>P</pageName><odePagStructures>
<odePagStructure><odeBlockId>b2</odeBlockId><blockName>Dos</blockName><odePagStructureOrder>2</odePagStructureOrder></odePagStructure>
<odePagStructure><odeBlockId>b1</odeBlockId><blockName>Uno</blockName><odePagStructureOrder>1</odePagStructureOrder><odeComponents>
<odeComponent><odeIdeviceId>i2</odeIdeviceId><odeIdeviceTypeName>text</odeIdeviceTypeName><odeComponentsOrder>2</odeComponentsOrder></odeComponent>
<odeComponent><odeIdeviceId>i1</odeIdeviceId><odeIdeviceTypeName>form</odeIdeviceTypeName><jsonProperties>{"q":"Pregunta"}</jsonProperties><odeComponentsOrder>1</odeComponentsOrder></odeComponent>
</odeComponents></odePagStructure></odePagStructures></odeNavStructure></odeNavStructures></ode>`;
  const [page] = (await loadProject(zip({ 'content.xml': xml }))).pages;
  expect(page!.blocks.map((b) => b.name)).toEqual(['Uno', 'Dos']);
  expect(page!.blocks[0]!.idevices).toEqual([
    { id: 'i1', type: 'form', lines: ['Pregunta'], raw: '{"q":"Pregunta"}' },
    { id: 'i2', type: 'text', lines: [], raw: '' },
  ]);
});

test('metadata: theme, eXe version and properties; fields rewritten on every save are ignored', async () => {
  const xml = `<?xml version="1.0"?><!-- c --><ode>
<userPreferences><userPreference><key>theme</key><value>base</value></userPreference></userPreferences>
<odeResources><odeResource><key>odeId</key><value>X</value></odeResource><odeResource><key>exe_version</key><value>4.0.5</value></odeResource></odeResources>
<odeProperties><odeProperty><key>pp_title</key><value>Tom &amp; Jerry &#233;</value></odeProperty><odeProperty><key>pp_modified</key><value>hoy</value></odeProperty>
<odeProperty><key>pp_screenshot</key><value>data:…</value></odeProperty><odeProperty><key>pp_subtitle</key><value/></odeProperty></odeProperties>
<odeNavStructures/></ode>`;
  const project = await loadProject(
    zip({ 'content.xml': xml, 'screenshot.png': 'PNG', 'custom/mío.txt': 'x', 'theme/style.css': 'x' }),
  );
  expect([...project.meta]).toEqual([
    ['theme', 'base'],
    ['exe_version', '4.0.5'],
    ['pp_title', 'Tom & Jerry é'],
    ['pp_subtitle', ''],
  ]);
  expect(project.pages).toEqual([]);
  expect([...project.resources.keys()]).toEqual(['screenshot.png', 'custom/mío.txt']);
});

test('eXeLearning 3 projects: entity-escaped HTML without CDATA, prefixed element names', async () => {
  const xml = `<x:ode xmlns:x="u"><x:odeNavStructures><x:odeNavStructure><x:odePageId>p</x:odePageId><x:pageName>P</x:pageName><x:odePagStructures><x:odePagStructure><x:odeBlockId>b</x:odeBlockId>
<x:odeComponents><x:odeComponent><x:odeIdeviceId>i</x:odeIdeviceId><x:odeIdeviceTypeName>text</x:odeIdeviceTypeName><x:htmlView>&lt;p&gt;Hola &amp;amp; adiós&lt;/p&gt;</x:htmlView></x:odeComponent></x:odeComponents>
</x:odePagStructure></x:odePagStructures></x:odeNavStructure></x:odeNavStructures></x:ode>`;
  expect((await loadProject(zip({ 'content.xml': xml }))).pages[0]!.blocks[0]!.idevices[0]!.lines).toEqual([
    'Hola & adiós',
  ]);
});

test('a CDATA section split around "]]>" is read as one text', async () => {
  const project = await loadProject(
    zip({
      'content.xml': contentXml([
        {
          id: 'p',
          title: 'P',
          blocks: [{ id: 'b', name: 'B', idevices: [{ id: 'i', html: '<p>a ]]]]><![CDATA[> b</p>' }] }],
        },
      ]),
    }),
  );
  expect(project.pages[0]!.blocks[0]!.idevices[0]!.lines).toEqual(['a ]]> b']);
});

test('rejects what is not an .elpx project, saying why', async () => {
  await expect(loadProject(zip({ 'contentv3.xml': '<instance/>' }))).rejects.toThrow('Legacy .elp project');
  await expect(loadProject(zip({ 'index.html': '' }))).rejects.toThrow('content.xml is missing');
  await expect(loadProject(zip({ 'content.xml': '<html></html>' }))).rejects.toThrow(
    'content.xml is not an eXeLearning project',
  );
  await expect(loadProject(new Uint8Array([1, 2, 3]))).rejects.toThrow('Not a ZIP file');
  expect((await loadProject(elpx([]))).pages).toEqual([]);
});
