import { inflateSync } from 'fflate';

/** Error caused by the input file (not a bug): shown to the user as is. */
export class ElpxError extends Error {}

export interface ZipEntry {
  readonly name: string;
  readonly size: number;
  readonly crc: number;
  /** Its bytes, inflated; refused when they are more than `max` (256 MiB unless told otherwise). */
  read(max?: number): Promise<Uint8Array>;
}

// Entries are inflated one by one, on read (content.xml, or every file for the marked copy); this bounds a zip
// bomb. The marked copy, which bounds the whole package instead, asks for more.
// The size is the one the directory declares, and nothing is inflated past it.
const MAX_INFLATED = 256 * 1024 * 1024;

const bytes = async (blob: Blob, offset: number, length: number): Promise<Uint8Array> =>
  new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
const view = (u: Uint8Array): DataView => new DataView(u.buffer, u.byteOffset, u.byteLength);

/**
 * Lists a ZIP from its central directory with ranged reads, so a project
 * with large videos is never loaded into memory: sizes and CRC-32 come from
 * the directory and entries are inflated only on read().
 * ponytail: no ZIP64 (archives over 4 GiB or 65534 entries are rejected); add it if such projects show up.
 */
export async function readZip(blob: Blob): Promise<Map<string, ZipEntry>> {
  const tail = await bytes(blob, Math.max(0, blob.size - 65557), 65557);
  const tv = view(tail);
  let e = tail.length - 22;
  while (e >= 0 && tv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new ElpxError('Not a ZIP file');
  const count = tv.getUint16(e + 10, true);
  const cdSize = tv.getUint32(e + 12, true);
  const cdOffset = tv.getUint32(e + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new ElpxError('ZIP64 archives are not supported');
  if (cdOffset + cdSize > blob.size) throw new ElpxError('Damaged ZIP file');
  const cd = await bytes(blob, cdOffset, cdSize);
  const cv = view(cd);
  const utf8 = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || cv.getUint32(p, true) !== 0x02014b50) throw new ElpxError('Damaged ZIP file');
    const flags = cv.getUint16(p + 8, true);
    const method = cv.getUint16(p + 10, true);
    const crc = cv.getUint32(p + 16, true);
    const csize = cv.getUint32(p + 20, true);
    const size = cv.getUint32(p + 24, true);
    const nameLength = cv.getUint16(p + 28, true);
    const local = cv.getUint32(p + 42, true);
    const name = utf8.decode(cd.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + cv.getUint16(p + 30, true) + cv.getUint16(p + 32, true);
    if (name.endsWith('/')) continue;
    entries.set(name, {
      name,
      size,
      crc,
      async read(max = MAX_INFLATED) {
        if (flags & 1) throw new ElpxError(`${name} is encrypted`);
        if (size > max) throw new ElpxError(`${name} is too large`);
        const lv = view(await bytes(blob, local, 30));
        if (lv.byteLength < 30 || lv.getUint32(0, true) !== 0x04034b50) throw new ElpxError('Damaged ZIP file');
        const data = await bytes(blob, local + 30 + lv.getUint16(26, true) + lv.getUint16(28, true), csize);
        if (method === 0) return data;
        if (method !== 8) throw new ElpxError(`${name}: unsupported compression method`);
        try {
          return inflateSync(data, { out: new Uint8Array(size) });
        } catch {
          throw new ElpxError(`${name} is damaged`);
        }
      },
    });
  }
  return entries;
}
