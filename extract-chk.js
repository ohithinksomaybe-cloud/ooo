// extract-chk.js
const fs = require('fs');
const { BufferList } = require('bl');
const zlib = require('zlib');
const decodeImplode = require('implode-decoder');

const REPLAY_MAGIC_CLASSIC = 0x53526572; // 'ReS' in LE
const REPLAY_MAGIC_SCR = 0x53526573;     // 'SeS' in LE

class DecompressStream {
  decompress(data) {
    return new Promise((resolve, reject) => {
      // ✅ FIX: Handle empty data
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
  
  // Read magic (4 bytes) - NOT from a block
  const magic = bl.readUInt32LE(0);
  console.log('Magic: 0x' + magic.toString(16));
  bl.consume(4);
  
  if (magic === REPLAY_MAGIC_SCR) {
    console.log('⚠️  This is an SCR (remastered) replay, not a downgraded one!');
    console.log('Please run the extraction on a downgraded _D.rep file');
    return;
  }
  
  if (magic !== REPLAY_MAGIC_CLASSIC) {
    console.error('❌ Invalid replay magic - this is not a valid classic replay');
    return;
  }
  
  console.log('✅ Valid classic replay format\n');
  
  // Helper to read a block
  async function readBlock(expectedSize) {
    if (bl.length < 8) {
      throw new Error('Not enough data for block header');
    }
    
    const checksum = bl.readUInt32LE(0);
    const chunks = bl.readUInt32LE(4);
    bl.consume(8);
    
    console.log(`  Checksum: 0x${checksum.toString(16)}, Chunks: ${chunks}`);
    
    let blockData = Buffer.alloc(0);
    
    for (let i = 0; i < chunks; i++) {
      if (bl.length < 4) {
        throw new Error(`Not enough data for chunk ${i} size`);
      }
      
      const chunkSize = bl.readUInt32LE(0);
      bl.consume(4);
      
      console.log(`    Chunk ${i}: ${chunkSize} compressed`);
      
      // ✅ FIX: Handle 0-size chunks
      if (chunkSize === 0) {
        console.log(`      -> 0 decompressed (empty chunk)`);
        continue;
      }
      
      if (bl.length < chunkSize) {
        throw new Error(`Not enough data for chunk ${i} (need ${chunkSize}, have ${bl.length})`);
      }
      
      const chunk = bl.slice(0, chunkSize);
      bl.consume(chunkSize);
      
      let decompressed;
      if (chunkSize > 0 && (chunk[0] === 0x78 || chunkSize < expectedSize)) {
        // Try to decompress
        try {
          decompressed = await new DecompressStream().decompress(Buffer.from(chunk));
          console.log(`      -> ${decompressed.length} decompressed`);
        } catch (e) {
          // If decompression fails, treat as raw
          console.log(`      -> Decompression failed, treating as raw`);
          decompressed = Buffer.from(chunk);
        }
      } else {
        // Raw data
        decompressed = Buffer.from(chunk);
        console.log(`      -> ${decompressed.length} bytes (raw)`);
      }

      blockData = Buffer.concat([blockData, decompressed]);
      
      console.log(`      -> ${decompressed.length} decompressed`);
    }
    
    console.log(`  Total: ${blockData.length} bytes (expected ${expectedSize})`);
    
    if (expectedSize > 0 && blockData.length !== expectedSize) {
      console.warn(`  ⚠️  Size mismatch!`);
    }
    
    return blockData;
  }
  
  try {
    // Read header block (0x279 bytes)
    console.log('=== Reading Header Block ===');
    const header = await readBlock(0x279);
    
    // Read commands size block (4 bytes)
    console.log('\n=== Reading Commands Size Block ===');
    const cmdsSizeBuf = await readBlock(4);
    const cmdsSize = cmdsSizeBuf.readUInt32LE(0);
    console.log(`  Commands decompressed size: ${cmdsSize}\n`);
    
    // Read commands block
    console.log('=== Reading Commands Block ===');
    const cmds = await readBlock(cmdsSize);
    
    // Read CHK size block (4 bytes)
    console.log('\n=== Reading CHK Size Block ===');
    const chkSizeBuf = await readBlock(4);
    const chkSize = chkSizeBuf.readUInt32LE(0);
    console.log(`  CHK decompressed size: ${chkSize}\n`);
    
    if (chkSize === 0) {
      console.error('❌ CHK size is 0 - CHK block is missing or corrupted!');
      return;
    }
    
    // Read CHK block
    console.log('=== Reading CHK Block ===');
    const chkData = await readBlock(chkSize);
    
    console.log(`\n✅ Total CHK data: ${chkData.length} bytes\n`);
    
    // Try to parse CHK
    console.log('=== Parsing CHK Sections ===');
    let offset = 0;
    let sectionCount = 0;
    let hasVer = false;
    
    while (offset < chkData.length - 8) {
      const name = chkData.toString('ascii', offset, offset + 4);
      const size = chkData.readUInt32LE(offset + 4);
      
      if (name === 'VER ') hasVer = true;
      
      console.log(`  ${sectionCount}: ${name} size=${size}`);
      
      if (size === 0) {
        offset += 8;
        sectionCount++;
        continue;
      }
      
      if (offset + 8 + size > chkData.length) {
        console.warn(`    ⚠️  Invalid section or end of data`);
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
    console.log(`\n✅ Saved extracted CHK to: ${outPath}`);
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error(`Remaining buffer size: ${bl.length} bytes`);
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