const { commandLength } = require('./commands');
const { CMDS } = require('./commands');
const bufToCommand      = require('./buf-to-cmd');
const bufToSCRCommand   = require('./buf-to-cmd-scr');

/**
 * Generator-based iterator over a raw commands buffer.
 *
 * Yields frame numbers (as plain integers) at each frame boundary,
 * then yields command objects within that frame.
 */
class CommandsStream {
  constructor(buffer) {
    this._buffer      = buffer ? buffer.duplicate() : new BufferList();
    this.currentFrame = 0;
  }

  *generate() {
    while (this._buffer.length >= 5) {
      const frame       = this._buffer.readUInt32LE(0);
      yield frame;

      const frameLength = this._buffer.readUInt8(4);
      const frameEnd    = 5 + frameLength;

      if (this._buffer.length < frameEnd) return;

      let pos = 5;
      while (pos < frameEnd) {
        const player = this._buffer.readUInt8(pos);     pos += 1;
        const cmdId     = this._buffer.readUInt8(pos);     pos += 1;
        const len    = commandLength(cmdId, this._buffer.shallowSlice(pos));

        if (len === null || pos + len > frameEnd) {
          console.error(frame, player, cmdId, pos);
          break;  // skip this frame, don't kill the whole stream
        }

        const data    = this._buffer.slice(pos, pos + len);
        pos          += len;

        const scrData = bufToSCRCommand(cmdId, data);
        const bwData  = bufToCommand(cmdId, data);
        const skipped = !scrData && !bwData;

        //loggy
        // console.log(frame, player, CMDS[cmdId]?.name, Object.keys(scrData).length === 0 ? bwData : scrData);

        yield { frame, cmdId, player, skipped, data, ...bwData, ...scrData };
      }

      this._buffer.consume(frameEnd);
    }
  }
}

module.exports = CommandsStream;
