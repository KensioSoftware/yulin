import { type ChildProcess, spawn } from "node:child_process";

interface SimWatchChildProcessProperties {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

/**
 * A spawned command, and the two moments in its life a supervisor waits on.
 *
 * Standard input, output and error are the supervisor's own, so the process
 * being watched prints where it would have printed if it had been started by
 * hand. The fourth channel is what the runtime inside it reports paths over.
 */
export class SimWatchChildProcess {
  readonly process: ChildProcess;
  readonly spawned: Promise<void>;
  readonly finished: Promise<void>;

  constructor(properties: SimWatchChildProcessProperties) {
    const { command, args, cwd, env } = properties;

    this.process = spawn(command, [...args], {
      cwd,
      env,
      stdio: ["inherit", "inherit", "inherit", "ipc"],
    });

    this.spawned = new Promise<void>((resolve, reject) => {
      this.process.once("spawn", resolve);
      this.process.once("error", (error: Error) => {
        reject(new Error(`Could not run ${command}: ${error.message}`));
      });
    });

    this.finished = new Promise<void>((resolve) => {
      this.process.once("exit", () => {
        resolve();
      });
    });
  }
}
