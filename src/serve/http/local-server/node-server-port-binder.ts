import type { Server } from "node:http";
import { simAwsLocalConfig } from "./sim-aws-local.config.js";
import { SimAwsLocalPortInUse } from "./sim-aws-local-port.error.js";
import { waitNodeServerListen } from "./wait-node-server-listen.js";

interface NodeServerPortBinderProperties {
  readonly server: Server;
  readonly address?: string;
  readonly waitMs?: number;
  readonly waitIntervalMs?: number;
}

/**
 * Binds a Node HTTP server to a port, waiting out a port that is still held.
 *
 * Restarting local development overlaps the process being replaced: the
 * outgoing one is still letting go of its listening socket while the incoming
 * one asks for the same number. Giving up on the first `EADDRINUSE` makes that
 * overlap fatal and loses the pinned port, so the bind is retried for a short
 * bounded period first. The bound is finite because a port held by an unrelated
 * process is never going to come free, and waiting forever would hide that.
 */
export class NodeServerPortBinder {
  private readonly server: Server;
  private readonly address: string;
  private readonly waitMs: number;
  private readonly waitIntervalMs: number;

  constructor(properties: NodeServerPortBinderProperties) {
    const {
      server,
      address = simAwsLocalConfig.loopbackAddress,
      waitMs = simAwsLocalConfig.portWaitMs,
      waitIntervalMs = simAwsLocalConfig.portWaitIntervalMs,
    } = properties;
    this.server = server;
    this.address = address;
    this.waitMs = waitMs;
    this.waitIntervalMs = waitIntervalMs;
  }

  /**
   * Start listening on the given port, waiting briefly for another listener to
   * release it. Port zero asks the operating system for a free port, so it
   * never waits.
   */
  async bind(port: number): Promise<void> {
    await this.attempt(port, Date.now() + this.waitMs);
  }

  /**
   * Try to bind once, and try again later if the port is only busy for now.
   *
   * A listen that failed leaves the server without a handle, so a later attempt
   * is an ordinary fresh listen on the same server rather than a reopening.
   */
  private async attempt(port: number, giveUpAt: number): Promise<void> {
    try {
      this.server.listen(port, this.address);
      await waitNodeServerListen(this.server);
    } catch (error) {
      if (!isPortInUse(error)) {
        throw error;
      }

      if (Date.now() >= giveUpAt) {
        throw new SimAwsLocalPortInUse(port, this.waitMs);
      }

      await pause(this.waitIntervalMs);
      await this.attempt(port, giveUpAt);
    }
  }
}

/**
 * Recognise the one listen failure that is worth waiting out.
 */
function isPortInUse(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && error.code === "EADDRINUSE"
  );
}

/**
 * Wait before the next attempt.
 */
async function pause(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
