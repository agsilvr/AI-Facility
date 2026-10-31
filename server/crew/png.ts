import { inflateSync } from "node:zlib";

export const MAX_ARTWORK_BYTES = 16 * 1024 * 1024;
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const table = Array.from({ length: 256 }, (_, i) => {
  for (let bit = 0; bit < 8; bit++) i = (i & 1) ? 0xedb88320 ^ (i >>> 1) : i >>> 1;
  return i >>> 0;
});
export function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Bounded decode of ordinary RGB/RGBA PNGs; a filename or header alone is not QC. */
export function inspectPng(data: Buffer) {
  if (data.length > MAX_ARTWORK_BYTES || data.length < 57 || !data.subarray(0, 8).equals(signature)) throw new Error("Upload a PNG image under 16 MB.");
  let offset = 8, width = 0, height = 0, channels = 0, ended = false, sawData = false, dataEnded = false;
  const compressed: Buffer[] = [];
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    if (length > data.length - offset - 12) throw new Error("PNG chunk is truncated.");
    const type = data.toString("ascii", offset + 4, offset + 8);
    const body = data.subarray(offset + 8, offset + 8 + length);
    if (crc32(data.subarray(offset + 4, offset + 8 + length)) !== data.readUInt32BE(offset + 8 + length)) throw new Error("PNG checksum failed.");
    if (!width && type !== "IHDR") throw new Error("PNG header is missing.");
    if (type === "IHDR") {
      if (width || length !== 13) throw new Error("PNG header is invalid.");
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      channels = body[9] === 2 ? 3 : body[9] === 6 ? 4 : 0;
      if (!width || !height || width > 8192 || height > 8192 || width * height > 24000000 || body[8] !== 8 || !channels || body[10] || body[11] || body[12]) throw new Error("Use a non-interlaced 8-bit RGB or RGBA PNG, up to 24 megapixels.");
    } else if (type === "IDAT") {
      if (dataEnded) throw new Error("PNG image chunks are out of order.");
      sawData = true; compressed.push(body);
    } else if (type === "IEND") {
      if (length || !sawData || offset + 12 !== data.length) throw new Error("PNG ending is invalid.");
      ended = true; break;
    } else {
      if (["acTL", "fcTL", "fdAT", "tRNS"].includes(type)) throw new Error("Use a static RGB or RGBA PNG with transparency in its alpha channel.");
      if (sawData) dataEnded = true;
      if (type[0] === type[0].toUpperCase() && type !== "PLTE") throw new Error("Unsupported PNG critical chunk.");
    }
    offset += length + 12;
  }
  if (!ended) throw new Error("PNG image is incomplete.");
  const stride = width * channels + 1;
  const pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: stride * height });
  if (pixels.length !== stride * height) throw new Error("PNG pixel data is incomplete.");
  let previous = Buffer.alloc(width * channels), row = Buffer.alloc(width * channels);
  let transparentPixels = 0, semiTransparentPixels = 0, opaquePixels = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = pixels[y * stride];
    if (filter > 4) throw new Error("PNG scanline filter is invalid.");
    for (let i = 0; i < row.length; i++) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = previous[i], upperLeft = i >= channels ? previous[i - channels] : 0;
      const prediction = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : 0;
      row[i] = (pixels[y * stride + i + 1] + prediction) & 255;
    }
    for (let x = 0; x < width; x++) {
      const alpha = channels === 4 ? row[x * channels + 3] : 255;
      if (alpha === 0) transparentPixels++;
      else {
        if (alpha === 255) opaquePixels++; else semiTransparentPixels++;
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
    [row, previous] = [previous, row];
  }
  return { width, height, inspection: { transparentPixels, semiTransparentPixels, opaquePixels,
    visibleBounds: maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } } };
}
