import { expect, test } from 'bun:test';

import { strToU8, zipSync } from 'fflate';

import { ElpxError, readZip } from '../src/zip.js';

const blob = (bytes: Uint8Array): Blob => new Blob([bytes as Uint8Array<ArrayBuffer>]);
const text = async (bytes: Uint8Array, name: string): Promise<string> =>
  new TextDecoder().decode(await (await readZip(blob(bytes))).get(name)!.read());
/** Offset of the first record with this signature. */
const find = (bytes: Uint8Array, signature: number): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i + 4 <= bytes.length; i++) if (view.getUint32(i, true) === signature) return i;
  throw new Error('signature not found');
};
const [LOCAL, CENTRAL, END] = [0x04034b50, 0x02014b50, 0x06054b50];
const patch = (bytes: Uint8Array, at: number, ...values: number[]): Uint8Array => {
  const copy = bytes.slice();
  copy.set(values, at);
  return copy;
};
const sample = (): Uint8Array =>
  zipSync({
    'a.txt': strToU8('hola '.repeat(50)),
    'dir/': new Uint8Array(),
    'dir/ñ.txt': [strToU8('stored'), { level: 0 }],
  });

test('lists entries with size and CRC, and reads deflated and stored ones', async () => {
  const entries = await readZip(blob(sample()));
  expect([...entries.keys()]).toEqual(['a.txt', 'dir/ñ.txt']); // folders are skipped, names are UTF-8
  expect(entries.get('a.txt')).toMatchObject({ name: 'a.txt', size: 250 });
  expect(entries.get('a.txt')!.crc).toBeGreaterThan(0);
  expect(await text(sample(), 'a.txt')).toBe('hola '.repeat(50));
  expect(await text(sample(), 'dir/ñ.txt')).toBe('stored');
});

test('an empty archive has no entries', async () => {
  expect((await readZip(blob(zipSync({})))).size).toBe(0);
});

test('rejects what is not a usable ZIP', async () => {
  const z = sample();
  const fails = async (bytes: Uint8Array, message: string): Promise<void> => {
    await expect(readZip(blob(bytes))).rejects.toThrow(new ElpxError(message));
  };
  await fails(strToU8('not a zip'), 'Not a ZIP file');
  await fails(new Uint8Array(), 'Not a ZIP file');
  const end = find(z, END);
  await fails(patch(z, end + 10, 0xff, 0xff), 'ZIP64 archives are not supported');
  await fails(patch(z, end + 16, 0xff, 0xff, 0xff, 0xff), 'ZIP64 archives are not supported');
  await fails(patch(z, end + 16, 0xff, 0xff, 0xff, 0x7f), 'Damaged ZIP file'); // directory beyond the file
  await fails(patch(z, find(z, CENTRAL), 0), 'Damaged ZIP file'); // bad central signature
});

test('rejects entries it cannot read, only when they are read', async () => {
  const z = sample();
  const central = find(z, CENTRAL);
  const read = async (bytes: Uint8Array): Promise<Uint8Array> => (await readZip(blob(bytes))).get('a.txt')!.read();
  await expect(read(patch(z, central + 8, 1))).rejects.toThrow('a.txt is encrypted');
  await expect(read(patch(z, central + 10, 12))).rejects.toThrow('a.txt: unsupported compression method');
  await expect(read(patch(z, central + 24, 0xff, 0xff, 0xff, 0x7f))).rejects.toThrow('a.txt is too large');
  await expect(read(patch(z, find(z, LOCAL) + 30 + 'a.txt'.length, 0x07))).rejects.toThrow('a.txt is damaged'); // not a deflate stream
  await expect(read(patch(z, find(z, LOCAL), 0))).rejects.toThrow('Damaged ZIP file');
});
