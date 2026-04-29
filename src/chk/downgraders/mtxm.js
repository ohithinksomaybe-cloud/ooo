const mappings  = require('downgrade-replay-tile-matches/matches.json');
const BufferList = require('bl/BufferList');
const { uint16 } = require('../../util/alloc');

/**
 * Attempts to backport SCR tile IDs in the MTXM chunk to classic equivalents.
 * Only works for tiles that have a known mapping; unknown tiles are passed through.
 *
 * Note: newer maps with heavily modified tilesets will likely corrupt or desync.
 */
class MtxmDowngrader {
  constructor(getChunks) {
    this.chunkName = 'MTXM';

    this.tileset   = getChunks('ERA\x20')[1].readUInt16LE(0) & 0x7;
    const dim      = getChunks('DIM\x20')[1];
    this.mapWidth  = dim.readUInt16LE(0);
    this.mapHeight = dim.readUInt16LE(2);
    this.mapping   = mappings[this.tileset].matches;
  }

  downgrade(buffer) {
    const out = new BufferList();

    for (let mapY = 0; mapY < this.mapHeight; mapY++) {
      for (let mapX = 0; mapX < this.mapWidth; mapX++) {
        const tile        = buffer.readUInt16LE(mapX * 2 + mapY * this.mapWidth * 2);
        const [, match]   = this.mapping.find(([scr]) => scr === tile) || [];
        out.append(uint16(match !== undefined ? match : tile));
      }
    }

    return [this.chunkName, out];
  }
}

module.exports = MtxmDowngrader;
