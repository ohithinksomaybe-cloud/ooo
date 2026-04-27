#!/usr/bin/env node
'use strict';

const fs       = require('fs');
const readline = require('readline');
const downgrade = require('./index');

const PROMPT = `
===============================================================================
Press T then Enter to backport SCR tiles, or just Enter for a normal downgrade
===============================================================================
`;

async function convertReplay(filePath, useMtxm) {
  const buf    = fs.readFileSync(filePath);
  const reader = new Int8Array(buf);

  const srep          = await downgrade.parseReplay(reader);

  // ✅ FIX: Properly convert BufferList to Buffer
  const originalChk = srep.chk.slice ? srep.chk.slice(0) : Buffer.from(srep.chk);

  fs.writeFileSync(filePath + '.original.chk', originalChk);
  console.log(`---> Saved original CHK: ${originalChk.length} bytes`);

  const chkDowngrader = new downgrade.ChkDowngrader({ mtxm: useMtxm });
  const arr = await downgrade.downgradeReplay(srep, chkDowngrader, filePath);

  const suffix  = useMtxm ? 'T' : 'F';
  const outPath = `${filePath.slice(0, -4)}_D.rep`;
  fs.writeFileSync(outPath, arr);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node main.js <replay.rep>');
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  
  // const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // rl.question(PROMPT, async (answer) => {
  //   rl.close();
    // const useMtxm = answer.trim().toLowerCase() === 't';
    const useMtxm = false;
    try {
      const anything = await convertReplay(filePath, useMtxm);
    } catch (err) {
      console.error('Conversion failed:', err);
      process.exit(1);
    }
  // });
}

main();
