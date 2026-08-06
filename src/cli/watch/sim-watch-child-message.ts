import type { ChildProcess } from "node:child_process";

/**
 * Whether an IPC message is one of the kind named.
 */
export function isWatchMessage(message: unknown, type: string): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === type
  );
}

/**
 * Whether an IPC message names a path to watch.
 */
export function isWatchPathMessage(
  message: unknown,
  type: string,
): message is { readonly path: string } {
  return (
    isWatchMessage(message, type) &&
    typeof message === "object" &&
    message !== null &&
    "path" in message &&
    typeof message.path === "string"
  );
}

/**
 * Wait for a process to send a message of one kind, and give up after a while.
 *
 * A process not running Yulin's runtime never answers, so this is a short wait
 * rather than a requirement.
 */
export async function waitWatchMessage(
  childProcess: ChildProcess,
  type: string,
  withinMs: number,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      childProcess.off("message", onMessage);
      resolve();
    };

    const onMessage = (message: unknown): void => {
      if (isWatchMessage(message, type)) {
        done();
      }
    };

    const timer = setTimeout(done, withinMs);

    childProcess.on("message", onMessage);
  });
}
