import type { Server } from "node:http";

/**
 * Wait until a Node HTTP server starts listening.
 */
export async function waitNodeServerListen(server: Server): Promise<void> {
  if (server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const listening = (): void => {
      cleanup();
      resolve();
    };

    const error = (cause: Error): void => {
      cleanup();
      reject(cause);
    };

    const cleanup = (): void => {
      server.off("listening", listening);
      server.off("error", error);
    };

    server.once("listening", listening);
    server.once("error", error);
  });
}
