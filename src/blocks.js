const { BufferList } = require('bl');
const zlib           = require('zlib');
const pkware         = require('pkware-wasm');
const { Writable, Readable } = require('stream');

const range = require('./util/range');

const MAX_CHUNK_SIZE = 0x2000;

// ---------------------------------------------------------------------------
// Decompression
// ---------------------------------------------------------------------------

/**
 * decompress one chunk.
 * Uses zlib for 0x78-prefixed (compress) data, PKWARE decompress otherwise.
 */
const inflate = async (buf) => {
  if (buf.readUInt8(0) !== 0x78) {
      return pkware.explode(buf);
  }
  return new Promise((resolve) => {
    new Readable({
      read() {
        this.push(buf);
        this.push(null);
      },
    })
      .pipe(zlib.createInflate())
      .pipe(new Writable({
        write(chunk, _, done) {
          resolve(chunk);
          done();
        },
      }));
  });
};

/**
 * Read one MPQ-style compressed block from a BufferList.
 *
 * Block layout:
 *   [uint32 crc32] [uint32 chunkCount]
 *   [uint32 chunkSize …]   (chunkCount entries)
 *   [compressed chunk data …]
 */
const block = async (buf, blockSize) => {
  if (blockSize === 0) {
    console.warn('block size 0');
    return new BufferList(); // empty, safe to .duplicate()
  }

  const checksum   = buf.readUInt32LE(0);
  const chunkCount = buf.readUInt32LE(4);
  buf.consume(8);

  const expectedChunks = Math.ceil(blockSize / MAX_CHUNK_SIZE);
  if (chunkCount !== expectedChunks) {
    throw new Error(`Expected ${expectedChunks} chunks, got ${chunkCount}`);
  }

  const chunks = [];
  const actualBlockSize = range(0, chunkCount).reduce((pos) => {
    const chunkSize = buf.readUInt32LE(pos);
    buf.consume(4);
    chunks.push({ buf: buf.slice(pos, pos + chunkSize) });
    return pos + chunkSize;
  }, 0);

  buf.consume(actualBlockSize);

  const isDeflated = actualBlockSize < blockSize;
  const inflated   = await Promise.all(
    chunks.map((chunk) => (isDeflated ? inflate(chunk.buf) : chunk.buf))
  );

  const result = inflated.reduce((acc, chunk) => acc.append(chunk), new BufferList());

  if (result.length !== blockSize) {
    throw new Error(`read bytes mismatch: expected ${blockSize}, got ${result.length}`);
  }

    const calcChecksum = pkware.crc32(result.slice(0));
    if (calcChecksum !== checksum) {
    throw new Error(`crc32 mismatch: expected ${checksum}, got ${calcChecksum}`);
  }

  return result;
};

// ---------------------------------------------------------------------------
// Compression
// ---------------------------------------------------------------------------

/** Compress one chunk using PKWARE implode. */
const deflate = async (buf) => pkware.implode(buf, pkware.ImplodeDictSize1);

/**
 * Return the total byte size a block will occupy after compression.
 * Useful for writing the uncompressed-size prefix before the block.
 */
const getBlockSize = async (data) => {
  const numChunks = Math.ceil(data.length / MAX_CHUNK_SIZE);
  let outBlockSize = 0;

  for (let i = 0; i < numChunks; i++) {
    const chunk    = data.slice(i * MAX_CHUNK_SIZE, i * MAX_CHUNK_SIZE + Math.min(MAX_CHUNK_SIZE, data.length));
    const chunkOut = await deflate(chunk);
    outBlockSize  += chunkOut.byteLength;
  }
  return outBlockSize;
};

/**
 * Compress `data` and append it as an MPQ block into `out` (a BufferList).
 * Pass `compress = false` to append raw (uncompressed) data directly.
 */
// src/blocks.js - FIX the writeBlock function
const writeBlock = async (out, data, compress) => {
  let buf;
  if (Buffer.isBuffer(data)) {
    buf = data;
  } else if (data instanceof Uint8Array) {
    buf = Buffer.from(data);
  } else if (typeof data.slice === 'function') {
    buf = Buffer.from(data.slice(0));
  } else {
    buf = Buffer.from(data);
  }
  
  const numChunks = Math.ceil(buf.length / MAX_CHUNK_SIZE);
  const checksum  = pkware.crc32(buf);

  // ✅ FIX: Use Buffer.alloc instead of Uint32Array for proper LE encoding
  const headerBuf = Buffer.alloc(8);
  headerBuf.writeUInt32LE(checksum, 0);
  headerBuf.writeUInt32LE(numChunks, 4);
  out.append(headerBuf);

  for (let i = 0; i < numChunks; i++) {
    const chunk = buf.slice(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE);
    const chunkOut = compress ? await deflate(chunk) : chunk;
    
    // ✅ FIX: Use Buffer.alloc for chunk size too
    const sizeBuf = Buffer.alloc(4);
    sizeBuf.writeUInt32LE(chunkOut.byteLength, 0);
    out.append(sizeBuf);
    out.append(chunkOut);
  }
};

module.exports = { block, writeBlock, getBlockSize };