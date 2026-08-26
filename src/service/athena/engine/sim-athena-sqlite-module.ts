import type { DatabaseSync } from "node:sqlite";

/** The one thing the engine needs out of `node:sqlite`. */
export interface SimAthenaSqliteModule {
  readonly DatabaseSync: new (path: string) => DatabaseSync;
}

/**
 * `node:sqlite`, loaded when a test turns the engine on.
 *
 * The import is dynamic so that the experimental warning Node prints on the
 * first one stays out of a run that never asked for a query engine.
 *
 * Node's own warning listeners are taken off around the import and put back
 * afterwards, so a project that installed one of its own keeps it, along with
 * every other warning it would have printed. The swap outlives the import by a
 * tick because `process.emitWarning` defers delivery, and restoring
 * synchronously would put the listeners back before the warning arrives.
 */
export async function simAthenaSqliteModule(): Promise<SimAthenaSqliteModule> {
  const listeners = process.listeners("warning");

  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    if (isSqliteWarning(warning)) {
      return;
    }

    for (const listener of listeners) {
      listener(warning);
    }
  });

  try {
    return await import("node:sqlite");
  } finally {
    await deliveryTick();
    process.removeAllListeners("warning");

    for (const listener of listeners) {
      process.on("warning", listener);
    }
  }
}

function deliveryTick(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function isSqliteWarning(warning: Error): boolean {
  return (
    warning.name === "ExperimentalWarning" && warning.message.includes("SQLite")
  );
}
