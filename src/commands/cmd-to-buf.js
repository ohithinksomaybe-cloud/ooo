const { CMDS }   = require('./commands');
const { uint16, uint8 } = require('../util/alloc');
const BufferList = require('bl/BufferList');
const scrUnitTag = require('./scr-unit-tag');

/**
 * Serialize a command object back into a [commandId, Buffer] pair.
 *
 * For classic BW replays (`isRemastered = false`) we pass the raw data through.
 * For SCR replays we translate extended commands into their BW equivalents,
 * remapping SCR unit tags to 1.16 unit tags in the process.
 *
 * @param  {number}  cmdId            Command id byte
 * @param  {Object}  cmd           Parsed command object
 * @param  {boolean} isRemastered  True if the source replay is SCR
 * @returns {[number, Buffer]}
 */
const commandToBuf = (cmdId, cmd, isRemastered, unitLimit = 1700, currFrame) => {
  if (!isRemastered) {
    return [cmdId, cmd.data];
  }

  switch (cmdId) {
    case CMDS.RIGHT_CLICK_EXT.id:
      return [
        CMDS.RIGHT_CLICK.id,
        new BufferList([
          uint16(cmd.x),
          uint16(cmd.y),
          uint16(scrUnitTag(cmd.unitTag, CMDS[cmdId]?.name, unitLimit, currFrame)),
          uint16(cmd.unit),
          uint8(cmd.queued),
        ]),
      ];

    case CMDS.SELECT_EXT.id:
    case CMDS.SELECTION_ADD_EXT.id:
    case CMDS.SELECTION_REMOVE_EXT.id: {
      const bwCmd = {
        [CMDS.SELECT_EXT.id]:           CMDS.SELECT,
        [CMDS.SELECTION_ADD_EXT.id]:    CMDS.SELECTION_ADD,
        [CMDS.SELECTION_REMOVE_EXT.id]: CMDS.SELECTION_REMOVE,
      }[cmdId];

      return [
        bwCmd.id,
        new BufferList([
          uint8(cmd.unitTags.length),
          ...cmd.unitTags.map((tag) => uint16(scrUnitTag(tag, CMDS[cmdId]?.name, unitLimit, currFrame))),
        ]),
      ];
    }

    case CMDS.TARGETED_ORDER_EXT.id:
      return [
        CMDS.TARGETED_ORDER.id,
        new BufferList([
          uint16(cmd.x),
          uint16(cmd.y),
          uint16(scrUnitTag(cmd.unitTag, CMDS[cmdId]?.name, unitLimit, currFrame)),
          uint16(cmd.unitTypeId),
          uint8(cmd.order),
          uint8(cmd.queued),
        ]),
      ];

    case CMDS.UNLOAD_EXT.id:
      return [CMDS.UNLOAD.id, new BufferList([uint16(scrUnitTag(cmd.unitTag, CMDS[cmdId]?.name, unitLimit, currFrame))])];

    case CMDS.CANCEL_TRAIN.id:
      return [cmdId, new BufferList([uint16(scrUnitTag(cmd.unitTag, CMDS[cmdId]?.name, unitLimit, currFrame))])];

    default:
      return [cmdId, cmd.data];
  }
};

module.exports = commandToBuf;
