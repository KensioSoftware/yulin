import {
  isSimLambdaHttpModuleSpecifier,
  makeSimLambdaHttpModule,
  simLambdaHttpModuleScheme,
} from "./sim-lambda-http-module.js";
import {
  isSimLambdaHttp2ModuleSpecifier,
  makeSimLambdaHttp2Module,
} from "./sim-lambda-http2-module.js";
import type { SimLambdaOutboundHttp } from "./sim-lambda-outbound-http.js";

/**
 * Whether a module specifier names one of the transport modules function code
 * makes requests through: `node:http`, `node:https` or `node:http2`.
 */
export function isSimLambdaTransportModuleSpecifier(
  specifier: string,
): boolean {
  return (
    isSimLambdaHttpModuleSpecifier(specifier) ||
    isSimLambdaHttp2ModuleSpecifier(specifier)
  );
}

/**
 * The transport module a specifier names, with its requests to the hostnames
 * the simulation serves answered by the simulation.
 */
export function makeSimLambdaTransportModule(
  specifier: string,
  hostModule: Record<string, unknown>,
  outbound: SimLambdaOutboundHttp,
): Record<string, unknown> {
  if (isSimLambdaHttp2ModuleSpecifier(specifier)) {
    return makeSimLambdaHttp2Module({ hostModule, outbound });
  }

  return makeSimLambdaHttpModule({
    hostModule,
    outbound,
    scheme: simLambdaHttpModuleScheme(specifier),
  });
}
