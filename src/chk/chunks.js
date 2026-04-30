const BufferList    = require('bl');
const { chunkTypes } = require('./common');

const PARTIAL_OVERWRITE = 0;

// Which chunk types are allowed to be partially overwritten by a later occurrence
const chunkWrites = {
  MTXM:       PARTIAL_OVERWRITE,
  STRx:       PARTIAL_OVERWRITE,
  'STR\x20':  PARTIAL_OVERWRITE,
  'ERA\x20':  PARTIAL_OVERWRITE,
};

/**
 * Parse a raw CHK buffer and return an array of [name, Buffer] tuples.
 * Handles duplicate chunks according to `chunkWrites` rules.
 *
 * @param  {Buffer} buf  Raw CHK section bytes
 * @returns {Array<[string, Buffer]>}
 */
const getChkChunks = (buf) => {
  const bl     = new BufferList(buf);
  const chunks = [];

  const chunkExists = (name) => chunks.find(([n]) => n === name);

  let pos = 0;
  console.log(`\nChk sections:\n============`);

  while (pos >= 0 && bl.length - pos >= 8) {
    const name            = bl.toString('ascii', pos, pos + 4);
    const chunkDefinition = chunkTypes.find((cname) => cname === name);
    const size            = bl.readUInt32LE(pos + 4);

    if (!chunkDefinition || size === 0) {
      if (size === 0) console.log(`0 size sect ${name}`);
      pos += size + 8;
      continue;
    }

    const buffer = bl.slice(pos + 8, pos + 8 + size);

    const writeType = chunkWrites[name];
    const previous  = chunkExists(name);

    if (previous && writeType !== undefined) {
      if (writeType === PARTIAL_OVERWRITE && previous[1].length > buffer.length) {
        // Keep the longer version, patch beginning with new data
        const newBuf = Buffer.concat([buffer, previous[1].slice(buffer.length)]);
        chunks.splice(chunks.indexOf(previous), 1, [name, newBuf]);
      } else {
        chunks.splice(chunks.indexOf(previous), 1, [name, buffer]);
      }
    } else {
      chunks.push([name, buffer]);
    }

    pos += size + 8;
  }

  return chunks;
};

module.exports = { getChkChunks };
