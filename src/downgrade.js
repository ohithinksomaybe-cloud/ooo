const { BufferList }   = require('bl');
const { HeaderMagicClassic, Version } = require('./common');
const { writeBlock, getBlockSize }    = require('./blocks');
const { uint32, uint8 }               = require('./util/alloc');
const commandToBuf                    = require('./commands/cmd-to-buf');
const { CMDS }                        = require('./commands/commands');
const CommandsStream                  = require('./commands/commands-stream');
const fs       = require('fs');

/**
 * Write a single frame's worth of commands into `buf`.
 */
const dumpFrame = (buf, frame, frameBuf) => {
  buf.append(uint32(frame));
  buf.append(uint8(frameBuf.length));
  buf.append(frameBuf);
};

/**
 * Convert a parsed SCR/Broodwar replay into a 1.16-compatible replay buffer.
 *
 * @typedef {Object}       replay         Result of parseReplay()
 * @param  {ChkDowngrader} chkDowngrader  An initialised ChkDowngrader instance
 * @returns {Promise<Buffer>}
 */
const downgradeReplay = async (replay, chkDowngrader, filePath) => {
  const bl = new BufferList();

  await writeBlock(bl, uint32(HeaderMagicClassic), false);
  await writeBlock(bl, replay.rawHeader, true);

  const commandsBuf  = new BufferList();
  let   currFrame    = 0;
  let   frameBuf     = new BufferList();
  let   cmd;

  const cmds         = new CommandsStream(replay.rawCmds);
  const g            = cmds.generate();
  const isRemastered = replay.version === Version.remastered;
  const unitLimit    = replay.limits?.units ?? 1700;

  // Loop through the CommandsStream, cmd is a dynamic type that can be a frame# or cmd object.
  try {
    while ((cmd = g.next().value)) {
      if (typeof cmd === 'number') {
        if (cmd !== currFrame) {
          dumpFrame(commandsBuf, currFrame, frameBuf);
          frameBuf  = new BufferList();
          currFrame = cmd;
        }
        continue;
      }

      if (cmd.skipped && !cmd.data)
      {
        console.log('Skipped cmd or no data: @ frame:', currFrame);
        continue;
      }
      // maps cmd-id & unit-id to v16 equivalents.
      const [cmdId, data] = commandToBuf(cmd.cmdId, cmd, isRemastered, unitLimit, currFrame);

      if (data.length !== CMDS[cmdId].length(data)) {
        throw new Error('saved length and command length do not match');
      }

      // Each frame is limited to 255 bytes; start a new frame if we overflow
      if (data.length + 2 + frameBuf.length > 255) {
        console.log('overflow split at frame', currFrame);
        dumpFrame(commandsBuf, currFrame, frameBuf);
        frameBuf = new BufferList();
      }

      frameBuf.append(uint8(cmd.player));
      frameBuf.append(uint8(cmdId));
      frameBuf.append(data);

      //loggy
      // console.log(String(currFrame).padStart(5, '0'), cmd.player, cmd.cmdId, data, '\n');
    }

    if (frameBuf.length) {
      dumpFrame(commandsBuf, currFrame, frameBuf);
    }
  } catch (e) {
    console.log('error', e);
  }

  await writeBlock(bl, uint32(commandsBuf.length), false);
  await writeBlock(bl, commandsBuf, true);

  console.log('commands-size decompressed & compressed:', commandsBuf.length, await getBlockSize(commandsBuf));

  // --- CHK section ---
  const chk = chkDowngrader.downgrade(replay.chk.slice(0));
  fs.writeFileSync(filePath + '.downgraded.chk', Buffer.from(chk));
  console.log(`---> Saved downgraded CHK: ${chk.length} bytes`);

  await writeBlock(bl, uint32(chk.byteLength), false);
  await writeBlock(bl, chk, true);

  return bl.slice(0);
};

module.exports = downgradeReplay;
