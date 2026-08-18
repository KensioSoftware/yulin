import { AsyncLocalStorage } from "node:async_hooks";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimLambdaOutboundHttp } from "../outbound/sim-lambda-outbound-http.js";
import { installSimLambdaOutboundClients } from "./sim-lambda-outbound-clients.js";

/**
 * The outbound HTTP the patched clients route through.
 *
 * An invocation in progress lends its own; anything else in the process
 * reaches the network as it always did, which is what keeps the patches inert
 * outside a sim Lambda invocation.
 */
class SimLambdaAmbientOutbound implements SimLambdaOutboundHttp {
  constructor(
    private readonly storage: AsyncLocalStorage<SimLambdaOutboundHttp>,
  ) {}

  /**
   * Whether the invocation in progress, if there is one, serves a hostname.
   */
  serves(hostname: string): boolean {
    return this.storage.getStore()?.serves(hostname) ?? false;
  }

  /**
   * Answer a request from the invocation in progress.
   */
  async fetch(request: Request): Promise<Response> {
    const outbound = this.storage.getStore();

    /* v8 ignore next 4 -- only reached for a request `serves` accepted, which
       is a request made while an invocation is in progress. */
    assertDefined(
      outbound,
      "sim Lambda invocation outbound HTTP for a request the simulation serves",
    );

    return await outbound.fetch(request);
  }
}

/**
 * Where the HTTP clients an in-process sim Lambda handler uses are routed to
 * the simulation it belongs to.
 *
 * A handler backed by a real in-process function is a closure over its own
 * module scope, so it reaches for the same `fetch`, `node:http` and
 * `node:https` as everything else in the test run. Zip code is handed clients
 * of its own by the sandbox and needs none of this. Node.js asynchronous
 * context tracking bridges the gap, exactly as it does for process.env and the
 * clock: the invocation's outbound HTTP is held in an AsyncLocalStorage store,
 * and the patched clients resolve to it while it is set.
 *
 * The store follows the invocation across await points, so concurrent
 * invocations of functions belonging to different simulations each reach their
 * own.
 */
class SimLambdaProcessOutbound {
  private readonly storage = new AsyncLocalStorage<SimLambdaOutboundHttp>();
  private installed = false;

  /**
   * Run an invocation with the given outbound HTTP answering the requests its
   * code makes to hostnames the simulation serves.
   */
  async run<T>(
    outbound: SimLambdaOutboundHttp,
    run: () => Promise<T>,
  ): Promise<T> {
    this.install();
    return await this.storage.run(outbound, run);
  }

  /**
   * Replace the process-wide HTTP clients with ones backed by the invocation
   * store.
   *
   * Installed on the first invocation of an in-process handler rather than at
   * import, so a test run that never uses one is left completely alone. With
   * no invocation running the patched clients hand every request to the host
   * client, so an installed patch behaves exactly like no patch at all. They
   * are never removed: removing them would be unsafe while another invocation
   * is in flight, and there is nothing to gain.
   */
  private install(): void {
    if (this.installed) {
      return;
    }
    this.installed = true;

    installSimLambdaOutboundClients(new SimLambdaAmbientOutbound(this.storage));
  }
}

/**
 * Shared because it patches process globals: one patch, one store.
 */
export const simLambdaProcessOutbound = new SimLambdaProcessOutbound();
