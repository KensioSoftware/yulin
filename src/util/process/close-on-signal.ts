/**
 * The signals a process is asked to stop with, when nothing else is said.
 *
 * Ctrl-C in a terminal, and the `SIGTERM` a supervisor or a container runtime
 * sends. Any other signal a script wants handled it names for itself.
 */
const defaultSignals: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

export interface SimCloseOnSignalOptions {
  /**
   * The signals to close on, in place of `SIGINT` and `SIGTERM`.
   */
  readonly signals?: readonly NodeJS.Signals[];
}

/**
 * A handler that closes something once, and then gets out of the way.
 *
 * The handlers come off as the first signal arrives, so closing runs once and a
 * second Ctrl-C from someone who has waited long enough lands on Node's own
 * default and ends the process. Nothing here exits the process: closing lets go
 * of what was holding the event loop open, and a process with nothing else to
 * do then exits on its own.
 */
class SimCloseOnSignal {
  private readonly close: () => Promise<void>;
  private readonly signals: readonly NodeJS.Signals[];

  private readonly stopListening = (): void => {
    for (const signal of this.signals) {
      process.off(signal, this.handle);
    }
  };

  private readonly handle = (): void => {
    this.stopListening();
    void this.close();
  };

  constructor(
    close: () => Promise<void>,
    options: SimCloseOnSignalOptions = {},
  ) {
    this.close = close;
    this.signals = options.signals ?? defaultSignals;
  }

  /**
   * Take the signals on, and hand back the way to give them up again.
   */
  listen(): () => void {
    for (const signal of this.signals) {
      process.on(signal, this.handle);
    }

    return this.stopListening;
  }
}

/**
 * Close something when the process is signalled, having been asked to.
 *
 * Yulin installs no signal handlers of its own, since a library taking over
 * process signals gets in the way of whatever else the process is doing. This
 * is how a script that wants one says so, and what comes back takes the
 * handlers off again.
 */
export function closeOnSignal(
  close: () => Promise<void>,
  options: SimCloseOnSignalOptions = {},
): () => void {
  return new SimCloseOnSignal(close, options).listen();
}
