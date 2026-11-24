import { strToU8, zipSync } from 'fflate';

export interface Idev {
  id: string;
  type?: string;
  html?: string;
  json?: string;
}
export interface P {
  id: string;
  title: string;
  parent?: string;
  blocks?: { id: string; name: string; idevices: Idev[] }[];
}

const kv = (tag: string, o: Record<string, string>): string =>
  Object.entries(o)
    .map(([k, v]) => `<${tag}><key>${k}</key><value>${v}</value></${tag}>`)
    .join('');

/** content.xml as eXeLearning 4 writes it. */
export function contentXml(pages: P[], meta: Record<string, string> = { pp_title: 'Recurso' }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ode SYSTEM "content.dtd">
<ode xmlns="http://www.intef.es/xsd/ode" version="2.0">
<odeProperties>${kv('odeProperty', meta)}</odeProperties>
<odeNavStructures>${pages
    .map(
      (
        p,
        i,
      ) => `<odeNavStructure><odePageId>${p.id}</odePageId><odeParentPageId>${p.parent ?? ''}</odeParentPageId><pageName>${p.title}</pageName>
<odeNavStructureOrder>${i}</odeNavStructureOrder><odePagStructures>${(p.blocks ?? [])
        .map(
          (
            b,
            j,
          ) => `<odePagStructure><odeBlockId>${b.id}</odeBlockId><blockName>${b.name}</blockName><odePagStructureOrder>${j}</odePagStructureOrder>
<odeComponents>${b.idevices
            .map(
              (
                c,
                k,
              ) => `<odeComponent><odeIdeviceId>${c.id}</odeIdeviceId><odeIdeviceTypeName>${c.type ?? 'text'}</odeIdeviceTypeName>
<htmlView><![CDATA[${c.html ?? ''}]]></htmlView><jsonProperties><![CDATA[${c.json ?? ''}]]></jsonProperties><odeComponentsOrder>${k}</odeComponentsOrder></odeComponent>`,
            )
            .join('')}</odeComponents></odePagStructure>`,
        )
        .join('')}</odePagStructures></odeNavStructure>`,
    )
    .join('')}</odeNavStructures></ode>`;
}

/** A ZIP with the given text entries. */
export const zip = (files: Record<string, string>): Uint8Array =>
  zipSync(Object.fromEntries(Object.entries(files).map(([name, body]) => [name, strToU8(body)])));

/** A minimal .elpx. */
export const elpx = (pages: P[], files: Record<string, string> = {}, meta?: Record<string, string>): Uint8Array =>
  zip({ 'content.xml': contentXml(pages, meta), 'index.html': '<html></html>', ...files });

/** One page, one box, one iDevice with the given HTML. */
export const single = (html: string, extra: Partial<Idev> = {}): Uint8Array =>
  elpx([{ id: 'p', title: 'Página', blocks: [{ id: 'b', name: 'Caja', idevices: [{ id: 'i', html, ...extra }] }] }]);

export const v1 = (): Uint8Array =>
  elpx(
    [
      {
        id: 'p1',
        title: 'Unidad 1 — Introducción',
        blocks: [
          { id: 'b1', name: 'Presentación', idevices: [{ id: 'i1', html: '<p>Texto introductorio</p>' }] },
          {
            id: 'b2',
            name: 'Actividad de evaluación',
            idevices: [
              { id: 'i2', html: '<p>¿Cuál es la capital de España?</p><p>Elige una.</p>' },
              { id: 'i3', html: '<p><img src="{{context_path}}/content/resources/mapa.png" alt="Mapa" /></p>' },
            ],
          },
        ],
      },
      { id: 'p2', title: 'Unidad 2' },
    ],
    { 'content/resources/mapa.png': 'PNG', 'content/resources/guia.pdf': 'PDF' },
  );

export const v2 = (): Uint8Array =>
  elpx(
    [
      {
        id: 'p1',
        title: 'Unidad 1 — Introducción',
        blocks: [
          { id: 'b1', name: 'Presentación', idevices: [{ id: 'i1', html: '<p>Texto introductorio</p>' }] },
          {
            id: 'b2',
            name: 'Actividad de evaluación',
            idevices: [
              { id: 'i2', html: '<p>¿Cuál es la capital de Canarias?</p><p>Elige una.</p>' },
              {
                id: 'i4',
                html: '<video src="{{context_path}}/content/resources/intro.mp4"></video><p>Nuevo vídeo explicativo</p>',
              },
            ],
          },
        ],
      },
      { id: 'p2', title: 'Unidad dos' },
    ],
    { 'content/resources/intro.mp4': 'MP4', 'content/resources/manual.pdf': 'PDF' },
    { pp_title: 'Recurso', pp_author: 'ATE' },
  );
