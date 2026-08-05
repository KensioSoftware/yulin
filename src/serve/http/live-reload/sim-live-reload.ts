import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { SimLiveReloadClient } from "./sim-live-reload-client.js";
import { SimLiveReloadInjector } from "./sim-live-reload-injector.js";
import { simLiveReloadConfig } from "./sim-live-reload.config.js";

interface SimLiveReloadProperties {
  readonly bootId?: string;
}

/**
 * Reloads a browser looking at a page the simulator served.
 *
 * Yulin is the only thing in the response path for a page served from a
 * simulated distribution, Function URL or Bucket website, so it is the only
 * thing that can tell the browser to reload. Pages get a script, the script
 * holds a connection open, and this is the end that decides what to say on it.
 *
 * The boot id is what makes a restart work. It identifies this process to the
 * pages connected to it, and a page that reconnects to a different one knows
 * it is looking at output from a process that is no longer running.
 */
export class SimLiveReload {
  private readonly bootId: string;
  private readonly clients = new Set<SimLiveReloadClient>();
  private readonly injector = new SimLiveReloadInjector();

  constructor(properties: SimLiveReloadProperties = {}) {
    const { bootId = randomUUID() } = properties;
    this.bootId = bootId;
  }

  /**
   * Whether this request is for the reload channel rather than for a simulated
   * service. The path is reserved on every served hostname, so a page can ask
   * for it relative to wherever it was served from.
   */
  isChannelRequest(request: IncomingMessage): boolean {
    if (request.method !== "GET") {
      return false;
    }

    const path = new URL(
      request.url ?? "/",
      "http://sim-aws.invalid",
    ).pathname.replace(/\/$/, "");

    return path === simLiveReloadConfig.channelPath;
  }

  /**
   * Open the reload channel for a browser, and tell it which process it has
   * reached.
   */
  connect(response: ServerResponse): void {
    const client = new SimLiveReloadClient(response);

    this.clients.add(client);
    client.onClose(() => {
      this.clients.delete(client);
    });

    client.open();
    client.send("boot", this.bootId);
  }

  /**
   * Put the reload script into a response, if that response can take it.
   */
  async injectInto(request: Request, response: Response): Promise<Response> {
    return this.injector.injectInto(request, response);
  }

  /**
   * Reload every connected browser now.
   */
  reload(): void {
    this.send("reload");
  }

  /**
   * Say a reload is coming, then let the connections go.
   *
   * The page learns that the gap it is about to see is a restart rather than a
   * server that has died. Ending the connections rather than leaving them for
   * the browser to notice is what makes the reconnection prompt.
   */
  stopping(): void {
    this.send("reloading");

    for (const client of this.clients) {
      client.end();
    }

    this.clients.clear();
  }

  private send(event: string): void {
    for (const client of this.clients) {
      client.send(event, this.bootId);
    }
  }
}
