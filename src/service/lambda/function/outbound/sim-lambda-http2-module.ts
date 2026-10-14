import type http2 from "node:http2";
import {
  type SimLambdaHttp2Connect,
  SimLambdaHttp2Session,
} from "./sim-lambda-http2-session.js";
import type { SimLambdaOutboundHttp } from "./sim-lambda-outbound-http.js";

/**
 * A `node:http2` module, as far as this needs to know.
 */
type NodeHttp2Module = Record<string, unknown>;

/**
 * The specifiers a bundler and a hand-written require may ask for the
 * HTTP/2 module by.
 */
const http2ModuleSpecifiers: ReadonlySet<string> = new Set([
  "http2",
  "node:http2",
]);

/**
 * Whether a module specifier names the HTTP/2 module.
 */
export function isSimLambdaHttp2ModuleSpecifier(specifier: string): boolean {
  return http2ModuleSpecifiers.has(specifier);
}

interface SimLambdaHttp2ModuleProperties {
  readonly hostModule: NodeHttp2Module;
  readonly outbound: SimLambdaOutboundHttp;
}

/**
 * Build the `node:http2` module sim Lambda function code connects through.
 *
 * Everything the real module exports is kept, and only `connect` is
 * replaced. A session to a hostname the simulation serves is a real HTTP/2
 * session, connected over an in-memory socket pair to a server in this
 * process that hands each request to the simulation. Every other session is
 * the host module's, connected exactly as it was asked for.
 *
 * Bedrock Runtime's SDK client sends over HTTP/2, so this is where its calls
 * from function code reach simulated Bedrock.
 */
export function makeSimLambdaHttp2Module(
  properties: SimLambdaHttp2ModuleProperties,
): NodeHttp2Module {
  const { hostModule, outbound } = properties;
  const hostConnect = hostModule["connect"] as SimLambdaHttp2Connect;

  return {
    ...hostModule,
    connect: (...callArguments: unknown[]): http2.ClientHttp2Session => {
      const authority = authorityUrl(callArguments[0]);
      if (authority === undefined || !outbound.serves(authority.hostname)) {
        return hostConnect(...callArguments);
      }

      return new SimLambdaHttp2Session(authority, outbound).connect(
        hostConnect,
        callArguments,
      );
    },
  };
}

/**
 * The URL `connect` was asked for, as a string or a URL, or undefined for
 * anything that is not one.
 */
function authorityUrl(authority: unknown): URL | undefined {
  if (authority instanceof URL) {
    return authority;
  }

  return typeof authority === "string" && URL.canParse(authority)
    ? new URL(authority)
    : undefined;
}
