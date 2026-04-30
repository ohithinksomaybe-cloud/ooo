const iconv = require('iconv-lite');

/**
 * Decode a null-terminated C string from a Buffer.
 * Tries CP-949 (Korean) first, falls back to CP-1252 (Latin) if there are
 * replacement characters.
 */
const cstring = (buf) => {
  const end = buf.indexOf(0);
  const text = end !== -1 ? buf.slice(0, end) : buf;

  const decoded = iconv.decode(text, 'cp949');
  return decoded.includes('\ufffd') ? iconv.decode(text, 'cp1252') : decoded;
};

module.exports = cstring;
