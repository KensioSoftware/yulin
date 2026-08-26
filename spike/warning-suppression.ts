/**
 * Can the node:sqlite ExperimentalWarning be suppressed without taking the
 * user's own warning handling with it?
 *
 * The warning is emitted through process.emitWarning, which defers delivery
 * to the next tick, so the listener swap has to outlive the import.
 */
const saved = process.listeners("warning");

process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (
    warning.name === "ExperimentalWarning" &&
    /SQLite/.test(warning.message)
  ) {
    return;
  }

  for (const listener of saved) listener(warning);
});

await import("node:sqlite");
await new Promise((resolve) => setImmediate(resolve));

process.removeAllListeners("warning");
for (const listener of saved) process.on("warning", listener);

process.emitWarning("a warning the user should still see");
