# downgrade-replay

Downgrade StarCraft Remastered (SCR) replays to the classic 1.16 format.

## Setup

```bash
npm install
```

## Usage

```bash
node main.js path/to/replay.rep
```

You'll be prompted:
- **Enter** — standard downgrade (no tile conversion)
- **T + Enter** — also backport SCR tiles to classic equivalents

The converted replay is saved in the same folder, with `_F.rep` or `_T.rep` appended.

## As a library

```js
const { parseReplay, downgradeReplay, ChkDowngrader } = require('./index');

const buf           = fs.readFileSync('replay.rep');
const srep          = await parseReplay(new Int8Array(buf));
const chkDowngrader = new ChkDowngrader({ mtxm: false });
const out           = await downgradeReplay(srep, chkDowngrader);
fs.writeFileSync('replay_F.rep', out);
```

## Project structure

```
index.js                        ← public API
main.js                         ← CLI entry point (replaces Batch.mjs)
src/
  common.js                     ← replay header magic bytes & version constants
  blocks.js                     ← MPQ block compression (pkware/zlib)
  replay.js                     ← top-level replay file parser
  header.js                     ← 0x279-byte header struct parser
  downgrade.js                  ← main downgrade orchestration
  util/
    alloc.js                    ← uint8/16/32 buffer helpers
    cstring.js                  ← null-terminated string decoder (CP949/CP1252)
    range.js                    ← range(start, size) array helper
  chk/
    common.js                   ← CHK version & chunk type constants
    chunks.js                   ← CHK binary chunk reader
    chk-downgrader.js           ← public ChkDowngrader class
    downgraders/
      index.js                  ← barrel export
      orchestrate.js            ← runs all downgraders, reassembles CHK
      version.js                ← VER chunk downgrader
      string.js                 ← STRx → STR  chunk downgrader
      crgb.js                   ← CRGB chunk removal
      mtxm.js                   ← MTXM tile backport (optional)
  commands/
    commands.js                 ← all command definitions (id + length)
    commands-stream.js          ← frame/command generator iterator
    buf-to-cmd.js               ← BW command binary → object
    buf-to-cmd-scr.js           ← SCR extended command binary → object
    cmd-to-buf.js               ← command object → BW binary
    scr-unit-tag.js             ← SCR → BW unit tag conversion
    validate.js                 ← pre-flight downgrade validator
```
