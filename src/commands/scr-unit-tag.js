/**
 * Convert a Starcraft Remastered unit tag to a classic 1.16 unit tag.
 *
 * BW 1.16 unit tags are 16-bit: GGGGG III IIII IIII
 *   I = unit index (0–1699), G = generation counter
 *
 * SCR expands the index space to ~3400 units with a 13-bit index field.
 * We reverse-map the SCR index back into the 1.16 range.
 */
const scrUnitTag = (scrTag, cmdName, unitLimit = 1700, currFrame) => {
  if (scrTag === 0) return 0;
  if (unitLimit === 1700) return scrTag;

  const scrIndex   = scrTag & 0x1fff;
  const generation = scrTag >> 13;
  const index      = 1700 - (unitLimit - scrIndex);

  if (index >= 1700) {
    throw new Error(`1.16 replay unit limit reached, @Frame:${currFrame}, ${cmdName}, Unit:${scrTag} -> index:${index}`);
  }
  
  const tag = index | (generation << 11); //tag = index always ? 

  // If mapping produced a negative tag, fall back to the original value
  if (tag < 0)
  {
    console.log(`Frame:${currFrame}, ${cmdName}, Unit:${scrTag} -> ${tag} is < 0`);
    return scrTag;
  }

  return tag;
};

module.exports = scrUnitTag;
