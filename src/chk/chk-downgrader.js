const { getChkChunks } = require('./chunks');
const { Orchestrate }  = require('./downgraders');

const DEFAULT_OPTIONS = {
  mtxm: false, // Set true to attempt tile backport (SCR → classic tilesets)
};

/**
 * High-level CHK downgrader.
 *
 * Usage:
 *   const chkDowngrader = new ChkDowngrader({ mtxm: true });
 *   const downgradedBuf = chkDowngrader.downgrade(rawChkBuffer);
 */
class ChkDowngrader {
  constructor(userOptions = {}) {
    this.opts = Object.assign({}, DEFAULT_OPTIONS, userOptions);
  }

  downgrade(buf) {
    const chunks      = getChkChunks(buf);
    const orchestrate = new Orchestrate(chunks, this.opts);
    return orchestrate.downgrade();
  }
}

module.exports = ChkDowngrader;
