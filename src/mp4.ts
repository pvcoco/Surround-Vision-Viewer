// Minimal MP4 box walker: finds the moov/mvhd box and returns the movie duration
// without reading the (large) mdat payload. GM recorder files put moov at the end.

export type RangeReader = (start: number, end: number) => Promise<ArrayBuffer>;

export async function readMp4Duration(read: RangeReader, fileSize: number): Promise<number | null> {
  let pos = 0;
  while (pos + 8 <= fileSize) {
    const head = new DataView(await read(pos, Math.min(pos + 16, fileSize)));
    let size = head.getUint32(0);
    const type = fourcc(head, 4);
    let headerLen = 8;
    if (size === 1) {
      size = Number(head.getBigUint64(8));
      headerLen = 16;
    } else if (size === 0) {
      size = fileSize - pos;
    }
    if (size < headerLen) return null;
    if (type === "moov") {
      const moov = new DataView(await read(pos + headerLen, Math.min(pos + size, fileSize)));
      return findMvhdDuration(moov);
    }
    pos += size;
  }
  return null;
}

/** Scans the children of a moov payload for mvhd and returns seconds. */
export function findMvhdDuration(moov: DataView): number | null {
  let p = 0;
  while (p + 8 <= moov.byteLength) {
    const size = moov.getUint32(p);
    const type = fourcc(moov, p + 4);
    if (size < 8) return null;
    if (type === "mvhd") {
      const c = p + 8;
      const version = moov.getUint8(c);
      const timescale = version === 1 ? moov.getUint32(c + 20) : moov.getUint32(c + 12);
      const duration = version === 1 ? Number(moov.getBigUint64(c + 24)) : moov.getUint32(c + 16);
      return timescale ? duration / timescale : null;
    }
    p += size;
  }
  return null;
}

function fourcc(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}
