/**
 * Drops the CRGB chunk (SCR-only custom player colors).
 * Returning null tells the orchestrator to omit the chunk entirely.
 */
class CRGBDowngrader {
  constructor() {
    this.chunkName = 'CRGB';
  }

  downgrade() {
    return null;
  }
}

module.exports = CRGBDowngrader;
