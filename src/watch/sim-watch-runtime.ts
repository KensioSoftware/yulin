import path from "node:path";
import { simWatchConfig, simWatchMessages } from "./sim-watch.config.js";

type SimWatchStoppingListener = () => void;
type SimWatchMessageListener = (message: unknown) => void;

/**
 * The part of the running process this needs, so a test can stand in for it
 * without touching the process its own test runner is talking over.
 */
export interface SimWatchProcess {
  readonly env: NodeJS.ProcessEnv;
  readonly send?: ((message: unknown) => boolean) | undefined;
  on(event: "message", listener: SimWatchMessageListener): unknown;
  off(event: "message", listener: SimWatchMessageListener): unknown;
}

interface SimWatchRuntimeProperties {
  readonly host?: SimWatchProcess;
}

/**
 * The half of watch mode that lives in the supervised process.
 *
 * It is inert unless `yulin watch` started this process, so nothing here
 * changes what a test run or an ordinary script does. Under a supervisor it
 * does two things: it names the paths Yulin is reading, so the supervisor can
 * watch them without the user listing paths Yulin is already holding, and it
 * passes on the warning that a restart is coming, so a served page hears about
 * it before the connection goes.
 */
export class SimWatchRuntime {
  private readonly host: SimWatchProcess;
  private readonly stoppingListeners = new Set<SimWatchStoppingListener>();
  private listening = false;

  private readonly onMessage = (message: unknown): void => {
    if (!isStoppingMessage(message)) {
      return;
    }

    for (const listener of this.stoppingListeners) {
      listener();
    }

    // The supervisor waits for this before killing the process, so whatever the
    // listeners wrote has left this end first.
    this.host.send?.({ type: simWatchMessages.stopped });
  };

  constructor(properties: SimWatchRuntimeProperties = {}) {
    const { host = process } = properties;
    this.host = host;
  }

  /**
   * Whether a `yulin watch` supervisor started this process.
   */
  supervised(): boolean {
    return (
      this.host.env[simWatchConfig.environmentVariableName] ===
        simWatchConfig.environmentVariableValue &&
      typeof this.host.send === "function"
    );
  }

  /**
   * Name a path the supervisor should watch, such as a directory mounted into a
   * Bucket or a synthesized template being deployed.
   *
   * Best effort by design. Nothing depends on the message arriving, and a
   * process with no supervisor drops it.
   */
  reportPath(reportedPath: string): void {
    if (!this.supervised()) {
      return;
    }

    this.host.send?.({
      type: simWatchMessages.path,
      path: path.resolve(reportedPath),
    });
  }

  /**
   * Run something when the supervisor says this process is about to restart.
   */
  onStopping(listener: SimWatchStoppingListener): void {
    if (!this.supervised()) {
      return;
    }

    this.stoppingListeners.add(listener);
    this.listen();
  }

  /**
   * Stop running something on a restart.
   */
  offStopping(listener: SimWatchStoppingListener): void {
    this.stoppingListeners.delete(listener);

    if (this.stoppingListeners.size === 0) {
      this.unlisten();
    }
  }

  private listen(): void {
    if (this.listening) {
      return;
    }

    this.listening = true;
    this.host.on("message", this.onMessage);
  }

  private unlisten(): void {
    if (!this.listening) {
      return;
    }

    this.listening = false;
    this.host.off("message", this.onMessage);
  }
}

function isStoppingMessage(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === simWatchMessages.stopping
  );
}

/**
 * The watch runtime for this process.
 *
 * One per process rather than one per `SimAws`, because it is about the process
 * a supervisor started, not about any one simulated environment. Several
 * simulations in the same process all report to the same supervisor.
 */
export const simWatch = new SimWatchRuntime();
