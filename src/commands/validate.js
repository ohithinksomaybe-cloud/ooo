const CommandsStream = require('./commands-stream');
const commandToBuf   = require('./cmd-to-buf');

/**
 * Dry-run the command translation to check whether a downgrade will succeed.
 * Returns true if all commands can be serialized without error, false otherwise.
 *
 * Useful for detecting replays that will hit the 1.16 unit-limit or other
 * known failure modes before doing the full conversion.
 *
 * @param  {Object} replay  Result of parseReplay()
 * @returns {boolean}
 */
const validateDowngrade = (replay) => {
  const cmds = new CommandsStream(replay.rawCmds);
  const g    = cmds.generate();
  let command;

  try {
    while ((command = g.next().value)) {
      if (typeof command === 'number') continue;
      commandToBuf(command.id, command, true);
    }
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

module.exports = validateDowngrade;
