const { Version } = require('../common');
const { uint16 }  = require('../../util/alloc');

/**
 * Downgrades the VER chunk.
 * SCR (64) → Hybrid (63), BroodwarRemastered (206) → Broodwar (205).
 */
class VersionDowngrader {
  constructor() {
    this.chunkName = 'VER\x20';
  }

  read(buffer) {
    return buffer.readUInt16LE(0);
  }

  downgrade(buffer) {
    const version    = buffer.readUInt16LE(0);
    const newVersion = uint16(Version.Hybrid);
    return [this.chunkName, newVersion];
  }
}

module.exports = VersionDowngrader;
