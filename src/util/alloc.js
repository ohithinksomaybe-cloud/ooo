// Tiny helpers that allocate a fixed-size Buffer and write a single LE integer.

const alloc = (n, cb) => {
  const b = Buffer.alloc(n);
  cb(b);
  return b;
};

const uint32 = (val) => alloc(4, (b) => b.writeUInt32LE(val));
const uint16 = (val) => alloc(2, (b) => b.writeUInt16LE(val));
const uint8  = (val) => alloc(1, (b) => b.writeUInt8(val));

module.exports = { uint32, uint16, uint8 };
