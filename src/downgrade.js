// src/downgrade.js
const { BufferList }   = require('bl');
const { HeaderMagicClassic, Version } = require('./common');
const { writeBlock, getBlockSize }    = require('./blocks');
const { uint32, uint8 }               = require('./util/alloc');
const commandToBuf                    = require('./commands/cmd-to-buf');
const { CMDS }                        = require('./commands/commands');
const CommandsStream                  = require('./commands/commands-stream');
const fs       = require('fs');
const pkware                          = require('pkware-wasm');  // ✅ ADD THIS

const dumpFrame = (buf, frame, frameBuf) => {
  buf.append(uint32(frame));
  buf.append(uint8(frameBuf.length));
  buf.append(frameBuf);
};

const downgradeReplay = async (replay, chkDowngrader, filePath) => {
  const bl = new BufferList();

  console.log('\n=== DOWNGRADE REPLAY STRUCTURE ===\n');

  // ✅ Magic: RAW BYTES, NOT A BLOCK
  console.log(`📝 Writing magic: 0x${HeaderMagicClassic.toString(16)}`);
  const magicBuf = uint32(HeaderMagicClassic);
  console.log(`   Magic buffer: ${magicBuf.toString('hex')}`);
  bl.append(magicBuf);
  console.log(`   Total size so far: ${bl.length}`);

  // Header: BLOCK
  console.log(`\n📦 Writing header block (0x279 bytes decompressed)`);
  await writeBlock(bl, replay.rawHeader, true);
  console.log(`   Total size so far: ${bl.length}`);

  // Commands
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

      if (cmd.skipped && !cmd.data) {
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
  console.log(`   Total size so far: ${bl.length}`);

  // Commands: BLOCK
  console.log(`\n📦 Writing commands block (${commandsBuf.length} bytes decompressed)`);
  // Commands: only write block if there are commands
  if (commandsBuf.length > 0) {
    await writeBlock(bl, commandsBuf, true);
  } else {
    // ✅ FIX: For empty commands, write an empty block properly
    // Write block header for 0 bytes: checksum + 1 chunk with 0 size
    const emptyBuf = Buffer.alloc(0);
    const checksum = pkware.crc32(emptyBuf);
    const headerBuf = Buffer.alloc(8);
    headerBuf.writeUInt32LE(checksum, 0);
    headerBuf.writeUInt32LE(0, 4);  // 0 chunks
    bl.append(headerBuf);
  }
  console.log(`   Total size so far: ${bl.length}`);

  console.log('commands-size decompressed & compressed:', commandsBuf.length, await getBlockSize(commandsBuf));

  // CHK
  const chk = chkDowngrader.downgrade(replay.chk.slice(0));
  fs.writeFileSync(filePath + '.downgraded.chk', Buffer.from(chk));
  console.log(`\n---> Saved downgraded CHK: ${chk.length} bytes`);

  const chkLength = chk.length ?? chk.byteLength ?? 0;
  await writeBlock(bl, uint32(chkLength), false);
  console.log(`   Total size so far: ${bl.length}`);

  // CHK: BLOCK
  console.log(`\n📦 Writing CHK block (${chkLength} bytes decompressed)`);
  await writeBlock(bl, chk, true);
  console.log(`   Total size so far: ${bl.length}`);

  console.log('\n=== DOWNGRADE COMPLETE ===\n');
  
  const result = bl.slice(0);
  console.log(`\nFirst 200 bytes of replay (hex):`);
  for (let i = 0; i < Math.min(200, result.length); i += 16) {
    const chunk = result.slice(i, i + 16);
    console.log(`  ${i.toString().padStart(3, '0')}: ${chunk.toString('hex')}`);
  }
  
  return result;
};

module.exports = downgradeReplay;