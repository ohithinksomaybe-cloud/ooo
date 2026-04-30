const BufferList        = require('bl/BufferList');
const VersionDowngrader = require('./version');
const StringDowngrader  = require('./string');
const CRGBDowngrader    = require('./crgb');
const MtxmDowngrader    = require('./mtxm');
const { Version }       = require('../common');
const { uint32 }        = require('../../util/alloc');
const validateChk       = require('../validator');  // ← Add this line

/**
 * Runs all applicable chunk downgraders against a parsed CHK chunk list
 * and reassembles the output buffer.
 */
class Orchestrate {
  constructor(chunks, opts) {
    this.chunks = Object.freeze(chunks);

    const versionDowngrader = new VersionDowngrader();
    this.downgraders = [
      versionDowngrader,
      new StringDowngrader(),
      new CRGBDowngrader(),
    ];

    if (opts.mtxm) {
      this.downgraders.push(new MtxmDowngrader(this._getChunk.bind(this)));
    }

    const version = versionDowngrader.read(this._getChunk(versionDowngrader.chunkName)[1]);
    this.isSCR = version === Version.SCR || version === Version.BroodwarRemastered;
  }

  _getChunk(chunkName) {
    return this.chunks.find(([name]) => name === chunkName);
  }

  downgrade() {
    const omit = [];
    const add  = [];
  
    // ✅ Log all chunks at the start
    console.log('\n=== INPUT CHUNKS ===');
    for (const [name, buffer] of this.chunks) {
      console.log(`  ${name}: ${buffer.length} bytes`);
    }
  
    for (const downgrader of this.downgraders) {
      console.log(`\nDowngrading ${downgrader.chunkName}`);
      const chunk = this._getChunk(downgrader.chunkName);
  
      if (!chunk) {
        console.log(`  ⚠️  NOT FOUND`);
        continue;
      }
  
      console.log(`  Input: ${chunk[1].length} bytes`);
      omit.push(downgrader.chunkName);
      const newChunk = downgrader.downgrade(chunk[1]);
  
      if (newChunk) {
        console.log(`  Output: ${newChunk[0]} (${newChunk[1].length} bytes)`);
        // Only add to omit if the NAME changed (chunk was renamed)
        if (newChunk[0] !== downgrader.chunkName) {
          omit.push(newChunk[0]);  // Also omit any old chunk with the new name
        }
        add.push(newChunk);
      } else {
        console.log(`  Output: (null - chunk removed)`);
      }
    }
  
    console.log('\n=== CHUNKS TO OMIT ===');
    console.log(omit);
  
    const outChunks = [];
    const verChunk = add.find(([n]) => n === 'VER ');
    if (verChunk) {
      outChunks.push(verChunk);
    }
    
    // Then add all other non-omitted chunks
    for (const [name, buffer] of this.chunks) {
      if (!omit.includes(name) && name !== 'VER ') {
        outChunks.push([name, buffer]);
      }
    }
    
    // Then any other newly added chunks
    for (const chunk of add) {
      if (chunk[0] !== 'VER ' && !this.chunks.some(([n]) => n === chunk[0])) {
        outChunks.push(chunk);
      }
    }
  
    console.log('\n=== FINAL OUTPUT CHUNKS ===');
    for (const [name, buffer] of outChunks) {
      console.log(`  ${name}: ${buffer.length} bytes`);
    }

    const out = new BufferList();
    for (const [name, buffer] of outChunks) {
      out.append(Buffer.from(name));
      out.append(uint32(buffer.length));
      out.append(buffer);
    }

    const result = out.slice(0);
    // ✅ VALIDATE HERE - right after reassembly
    validateChk(result);
    
    return result;
  }
}

module.exports = Orchestrate;
