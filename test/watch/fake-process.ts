import type { SimWatchProcess } from "../../src/watch/sim-watch-runtime.js";
import { simWatchConfig } from "../../src/watch/sim-watch.config.js";

interface FakeProcessProperties {
  readonly supervised?: boolean;
  readonly connected?: boolean;
}

/**
 * A stand-in for the running process.
 *
 * The watch runtime talks over the same channel a test runner uses to reach its
 * workers, so a test that reached for the real `process` would be writing to
 * the runner's own IPC.
 */
export class FakeProcess implements SimWatchProcess {
  readonly env: NodeJS.ProcessEnv = {};
  readonly sent: Record<string, unknown>[] = [];
  readonly listeners: ((message: unknown) => void)[] = [];
  readonly send: ((message: unknown) => boolean) | undefined;

  constructor(properties: FakeProcessProperties = {}) {
    const { supervised = true, connected = true } = properties;

    if (supervised) {
      this.env[simWatchConfig.environmentVariableName] =
        simWatchConfig.environmentVariableValue;
    }

    if (connected) {
      this.send = (message: unknown): boolean => {
        this.sent.push(message as Record<string, unknown>);
        return true;
      };
    }
  }

  /**
   * Note a listener, as the process would.
   */
  on(_event: "message", listener: (message: unknown) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Forget a listener, as the process would.
   */
  off(_event: "message", listener: (message: unknown) => void): void {
    const at = this.listeners.indexOf(listener);

    if (at !== -1) {
      this.listeners.splice(at, 1);
    }
  }

  /**
   * Hand a message to whatever is listening, as the supervisor would.
   */
  deliver(message: unknown): void {
    for (const listener of this.listeners) {
      listener(message);
    }
  }
}
