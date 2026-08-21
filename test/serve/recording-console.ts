import type { SimMessageConsole } from "../../src/serve/message/sim-message-log-console.js";

/**
 * A console that keeps what it was told to print.
 *
 * The message lines go to the process console in a real dev loop, and a test
 * reads them here instead of watching its own output.
 */
export interface RecordingConsole extends SimMessageConsole {
  readonly lines: readonly string[];
}

/**
 * Make a console a test can read back.
 */
export function recordingConsole(): RecordingConsole {
  const lines: string[] = [];

  return {
    lines,
    log: (line: string): void => {
      lines.push(line);
    },
  };
}
