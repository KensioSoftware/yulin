import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { makeSimLambdaHttpModule } from "../outbound/sim-lambda-http-module.js";
import { makeSimLambdaOutboundFetch } from "../outbound/sim-lambda-outbound-fetch.js";
import type { SimLambdaOutboundHttp } from "../outbound/sim-lambda-outbound-http.js";

/**
 * The transport modules an in-process handler makes requests through, with the
 * scheme each one carries.
 */
const transportModules = [
  [http, "http:"],
  [https, "https:"],
] as const;

/**
 * Replace the process-wide HTTP clients with ones an outbound HTTP answers
 * for.
 *
 * The global `fetch` is defined rather than assigned, to keep it the
 * configurable, writable, non-enumerable global property it already was:
 * anything else replacing it has to find what it expects.
 *
 * The transport modules are what a handler holds, so the two functions that
 * start a request are replaced on them in place, leaving everything else the
 * modules export as it was. The built-in modules' named ES module exports are
 * a snapshot of those properties, so they are re-synchronised afterwards for
 * the handler that imported `request` by name rather than the module.
 */
export function installSimLambdaOutboundClients(
  outbound: SimLambdaOutboundHttp,
): void {
  const hostFetch = globalThis.fetch;

  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: makeSimLambdaOutboundFetch(outbound, hostFetch),
  });

  for (const [hostModule, scheme] of transportModules) {
    const routed = makeSimLambdaHttpModule({ hostModule, outbound, scheme });
    const patched = hostModule as unknown as Record<string, unknown>;

    patched["request"] = routed["request"];
    patched["get"] = routed["get"];
  }

  syncBuiltinESMExports();
}
