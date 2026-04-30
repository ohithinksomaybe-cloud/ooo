const { BufferList } = require('bl');
const { HeaderMagicClassic, HeaderMagicScrModern, Version } = require('./common');
const parseHeader = require('./header');
const { block } = require('./blocks');

// Default limits (standard SC:R without extended unit patch)
const DEFAULT_LIMITS = {
  images: 5000, sprites: 2500, thingies: 0,
  units: 1700, bullets: 100, orders: 2000, fogSprites: 0,
};

const parseLMTS = (buf) => ({
  images:     buf.readUInt32LE(0),
  sprites:    buf.readUInt32LE(4),
  thingies:   buf.readUInt32LE(8),
  units:      buf.readUInt32LE(0xc),
  bullets:    buf.readUInt32LE(0x10),
  orders:     buf.readUInt32LE(0x14),
  fogSprites: buf.readUInt32LE(0x18),
});

const parseSCRSection = async (buf) => {
  while (buf.length) {
    const tag  = buf.slice(0, 4).toString('ascii');
    const size = buf.readUInt32LE(4);
    buf.consume(8);
    if (tag === 'LMTS') {
      return parseLMTS(await block(buf, 0x1c));
    } else {
      buf.consume(size);
    }
  }
  return null;
};

const parseReplay = async (buf) => {
  const bl = new BufferList();
  bl.append(buf);

  const magic = (await block(bl, 4)).readUInt32LE(0);

  if (magic === HeaderMagicClassic) {
    console.log('replay: v16');
    process.exit(1);
  } else if (magic !== HeaderMagicScrModern) {
    throw new Error('not a replay');
  }

  // SCR: next 4 bytes are the offset to the SCR section at end of file
  const scrOffset = bl.readUInt32LE(0);
  bl.consume(4);

  const rawHeader = await block(bl, 0x279);
  const header    = parseHeader(rawHeader);

  const cmdsSize = (await block(bl, 4)).readUInt32LE(0);
  const rawCmds  = cmdsSize > 0 ? await block(bl, cmdsSize) : new BufferList();

  const chkSize = (await block(bl, 4)).readUInt32LE(0);
  const chk     = await block(bl, chkSize);

  // Parse SCR section to detect actual unit limit
  let limits = { ...DEFAULT_LIMITS };
  if (scrOffset > 0 && scrOffset < buf.length) {
    const scrBuf = new BufferList(
      Buffer.isBuffer(buf) ? buf.subarray(scrOffset) : Buffer.from(buf).subarray(scrOffset)
    );
    const parsed = await parseSCRSection(scrBuf);
    if (parsed) limits = parsed;
    }

  console.log(`replay: v17+, unit limit = ${limits.units}`);

  return { version: Version.remastered, rawHeader, header, rawCmds, chk, limits };
};

module.exports = parseReplay;