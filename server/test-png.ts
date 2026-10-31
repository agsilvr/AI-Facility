import { deflateSync } from "node:zlib";
import { crc32 } from "./crew/png";

/** A real, tiny RGB PNG for integrity and handoff regression tests. */
export function testPng(width = 2, height = 3, rgbaScanlines?: Buffer) {
  const chunk = (type: string, body: Buffer) => {
    const out = Buffer.alloc(body.length + 12);
    out.writeUInt32BE(body.length); out.write(type, 4); body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = rgbaScanlines ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(rgbaScanlines ?? Buffer.alloc((width * 3 + 1) * height))), chunk("IEND", Buffer.alloc(0))]);
}
