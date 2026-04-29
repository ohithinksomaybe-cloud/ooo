/**
 * Converts the SCR-format STRx chunk (32-bit offsets, 32-bit count)
 * to the classic STR  chunk (16-bit offsets, 16-bit count).
 */
class StringDowngrader {
  constructor() {
    this.chunkName = 'STRx';
  }

  downgrade(buffer) {
    const numStrings    = buffer.readUInt32LE(0);
    const inHeaderSize  = 4 + numStrings * 4; // STRx: uint32 count + uint32[] offsets
    const outHeaderSize = 2 + numStrings * 2; // STR : uint16 count + uint16[] offsets
    const out = Buffer.alloc(outHeaderSize + (buffer.byteLength - inHeaderSize), 0);

    out.writeUInt16LE(numStrings, 0);

    for (let i = 1; i < numStrings; i++) {
      const strxIndex = buffer.readUInt32LE(i * 4);
      const strxBuf   = buffer.slice(strxIndex, buffer.indexOf(0, strxIndex) + 1);

      if (strxBuf.byteLength === 0) continue;

      const outIndex = strxIndex - inHeaderSize + outHeaderSize;
      out.writeUInt16LE(outIndex, i * 2);
      strxBuf.copy(out, outIndex);
    }

    return ['STR\x20', out];
  }
}

module.exports = StringDowngrader;
