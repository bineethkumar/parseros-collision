// Minimal ZIP writer for backups, built in the browser. Files are stored without compression:
// photos are already-compressed JPEGs, and the text files are small. Limits: 65,535 files, 4 GB.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipWriter() {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0, count = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  return {
    get size() { return offset; },
    // data: string, Uint8Array or Blob. name: path inside the zip, "/" between folders.
    async add(name, data) {
      const bytes = typeof data === "string" ? enc.encode(data) : data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
      const nameBytes = enc.encode(name);
      const crc = crc32(bytes), size = bytes.length;
      if (count >= 65535) throw new Error("Too many files for one backup.");
      if (offset + 30 + nameBytes.length + size > 0xfffffff0) throw new Error("This backup is over 4 GB. Ask your developer to split it.");

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);   // local file header
      local.setUint16(4, 20, true);           // version needed
      local.setUint16(6, 0x0800, true);       // UTF-8 file names
      local.setUint16(8, 0, true);            // stored (no compression)
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);
      parts.push(local.buffer, nameBytes, new Blob([bytes])); // Blob lets the browser keep big files off the JS heap

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);      // central directory header
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, dosTime, true);
      cd.setUint16(14, dosDate, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, size, true);
      cd.setUint32(24, size, true);
      cd.setUint16(28, nameBytes.length, true);
      cd.setUint32(42, offset, true);         // where the local header starts
      central.push(cd.buffer, nameBytes);

      offset += 30 + nameBytes.length + size;
      count++;
    },
    blob() {
      const cdSize = central.reduce((a, p) => a + p.byteLength, 0);
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);     // end of central directory
      end.setUint16(8, count, true);
      end.setUint16(10, count, true);
      end.setUint32(12, cdSize, true);
      end.setUint32(16, offset, true);
      return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
    },
  };
}
