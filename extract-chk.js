// extract-chk.js - FIXED VERSION
const fs = require('fs');
const { BufferList } = require('bl');
const zlib = require('zlib');
const decodeImplode = require('implode-decoder');

const REPLAY_MAGIC_CLASSIC = 0x53526572;
const REPLAY_MAGIC_SCR = 0x53526573;

class DecompressStream {
  decompress(data) {
    return new Promise((resolve, reject) => {
      if (data.length === 0) {
        resolve(Buffer.alloc(0));
        return;
      }
      
      if (data[0] === 0x78) {
        const inflate = zlib.createInflate();
        let result = Buffer.alloc(0);
        inflate.on('data', chunk => {
          result = Buffer.concat([result, chunk]);
        });
        inflate.on('end', () => resolve(result));
        inflate.on('error', reject);
        inflate.write(data);
        inflate.end();
      } else {
        const implode = decodeImplode();
        let result = Buffer.alloc(0);
        implode.on('data', chunk => {
          result = Buffer.concat([result, chunk]);
        });
        implode.on('end', () => resolve(result));
        implode.on('error', reject);
        implode.write(data);
        implode.end();
      }
    });
  }
}

async function extractChk(filePath) {
  console.log(`\nExtracting CHK from: ${filePath}\n`);
  
  const buf = fs.readFileSync(filePath);
  const bl = new BufferList(buf);
  
  // Helper to read a block
  async function readBlock(expectedSize, blockName = 'Block') {
    if (bl.length < 8) {
      throw new Error(`Not enough data for ${blockName} header`);
    }
    
    const checksum = bl.readUInt32LE(0);
    const chunks = bl.readUInt32LE(4);
    bl.consume(8);
    
    console.log(`=== ${blockName} ===`);
    console.log(`  Checksum: 0x${checksum.toString(16)}, Chunks: ${chunks}`);
    
    let blockData = Buffer.alloc(0);
    
    for (let i = 0; i < chunks; i++) {
      if (bl.length < 4) {
        throw new Error(`Not enough data for ${blockName} chunk ${i} size`);
      }
      
      const chunkSize = bl.readUInt32LE(0);
      bl.consume(4);
      
      console.log(`  Chunk ${i}: ${chunkSize} bytes`);
      
      if (chunkSize === 0) {
        console.log(`    -> 0 decompressed (empty chunk)`);
        continue;
      }
      
      if (bl.length < chunkSize) {
        throw new Error(`Not enough data for ${blockName} chunk ${i}`);
      }
      
      const chunk = bl.slice(0, chunkSize);
      bl.consume(chunkSize);
      
      // Try to decompress
      let decompressed;
      if (chunk[0] === 0x78 || chunkSize < expectedSize) {
        try {
          decompressed = await new DecompressStream().decompress(Buffer.from(chunk));
          console.log(`    -> ${decompressed.length} decompressed`);
        } catch (e) {
          console.log(`    -> Decompression failed, treating as raw`);
          decompressed = Buffer.from(chunk);
        }
      } else {
        decompressed = Buffer.from(chunk);
        console.log(`    -> ${decompressed.length} bytes (raw)`);
      }
      
      blockData = Buffer.concat([blockData, decompressed]);
    }
    
    console.log(`  Total: ${blockData.length} bytes (expected ${expectedSize})\n`);
    
    return blockData;
  }
  
  try {
    // Read magic block (4 bytes)
    const magicBuf = await readBlock(4, 'Magic Block');
    const magic = magicBuf.readUInt32LE(0);
    console.log(`Magic: 0x${magic.toString(16)}`);
    
    if (magic !== REPLAY_MAGIC_CLASSIC && magic !== REPLAY_MAGIC_SCR) {
      console.error(`❌ Invalid replay magic`);
      return;
    }
    
    if (magic === REPLAY_MAGIC_SCR) {
      console.log('⚠️  This is an SCR replay, not a classic downgraded one!');
      return;
    }
    
    console.log('✅ Valid classic replay format\n');
    
    // Read header block (0x279 bytes)
    await readBlock(0x279, 'Header Block');
    
    // Read commands size block (4 bytes)
    const cmdsSizeBuf = await readBlock(4, 'Commands Size Block');
    const cmdsSize = cmdsSizeBuf.readUInt32LE(0);
    console.log(`Commands decompressed size: ${cmdsSize}\n`);
    
    // Read commands block (if any)
    if (cmdsSize > 0) {
      await readBlock(cmdsSize, 'Commands Block');
    } else {
      console.log('=== Commands Block ===');
      console.log('  (empty, skipping)\n');
    }
    
    // Read CHK size block (4 bytes)
    const chkSizeBuf = await readBlock(4, 'CHK Size Block');
    const chkSize = chkSizeBuf.readUInt32LE(0);
    console.log(`CHK decompressed size: ${chkSize}\n`);
    
    if (chkSize === 0) {
      console.error('❌ CHK size is 0 - CHK is missing!');
      return;
    }
    
    // Read CHK block
    const chkData = await readBlock(chkSize, 'CHK Block');
    
    // Parse CHK sections
    console.log('=== CHK Sections ===');
    let offset = 0;
    let sectionCount = 0;
    let hasVer = false;
    
    while (offset < chkData.length - 8) {
      const name = chkData.toString('ascii', offset, offset + 4);
      const size = chkData.readUInt32LE(offset + 4);
      
      if (name === 'VER ') hasVer = true;
      
      console.log(`  ${sectionCount}: ${name} size=${size}`);
      
      if (size === 0 || offset + 8 + size > chkData.length) {
        break;
      }
      
      offset += 8 + size;
      sectionCount++;
    }
    
    console.log(`\nTotal sections found: ${sectionCount}`);
    console.log(hasVer ? '✅ VER  section present' : '❌ VER  section MISSING!');
    
    // Save extracted CHK
    const outPath = filePath + '.extracted.chk';
    fs.writeFileSync(outPath, chkData);
    console.log(`\n✅ Saved extracted CHK to: ${outPath}\n`);
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error(`Remaining buffer size: ${bl.length} bytes\n`);
  }
}

const replayPath = process.argv[2];
if (!replayPath) {
  console.error('Usage: node extract-chk.js <replay_D.rep>');
  process.exit(1);
}

extractChk(replayPath).catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});