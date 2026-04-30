// src/chk/validator.js
const validateChk = (buffer) => {
  const chunks = new Map();
  let offset = 0;

  while (offset < buffer.length - 8) {
    const name = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    chunks.set(name, { offset, size });
    offset += 8 + size;
  }

  console.log('\nFound sections:', '\'' + Array.from(chunks.keys()).join('\', \'') + '\'');
  
  const required = ['VER ', 'OWNR', 'SIDE', 'ISOM'];
  const missing = required.filter(c => !chunks.has(c));
  
  if (missing.length > 0) {
    console.log(`Missing required section: ${missing.join(', ')}`);
  }

  return chunks;
};

module.exports = validateChk;