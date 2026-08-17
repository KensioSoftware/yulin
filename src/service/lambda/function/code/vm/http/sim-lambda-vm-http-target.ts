import { isRecord } from "../../../../../../util/type-guard/record.js";

/**
 * The hostname suffixes AWS issues its API endpoints under.
 *
 * A request to one of these is a request to AWS whoever sent it, so it belongs
 * to the simulation rather than the network. Everything else a function asks
 * for still goes wherever it was addressed.
 */
const awsEndpointSuffixes: readonly string[] = [
  ".amazonaws.com",
  ".amazonaws.com.cn",
  ".api.aws",
  ".on.aws",
];

/**
 * Where an outgoing HTTP request from sim Lambda function code is addressed.
 */
export interface SimLambdaVmHttpTarget {
  readonly hostname: string;
  readonly path: string;
  readonly method: string;
  readonly headers: Record<string, string>;
}

/**
 * Whether a hostname is an AWS API endpoint.
 */
export function isSimAwsEndpointHostname(hostname: string): boolean {
  const name = hostname.toLowerCase();

  return awsEndpointSuffixes.some((suffix) => name.endsWith(suffix));
}

/**
 * Read where a call to `http.request` or `https.request` is addressed.
 *
 * Both accept a URL, an options object, or a URL followed by an options
 * object, so all three are understood here. Arguments that make sense to
 * neither form read as undefined, which leaves the request to the host module
 * and its own error message rather than inventing one.
 */
export function readSimLambdaVmHttpTarget(
  callArguments: readonly unknown[],
): SimLambdaVmHttpTarget | undefined {
  const [first, second] = callArguments;
  const url = requestUrl(first);
  const optionsArgument = url === undefined ? first : second;
  const options = isRecord(optionsArgument) ? optionsArgument : undefined;

  const hostname = targetHostname(options, url);
  if (hostname === undefined) {
    return undefined;
  }

  return {
    hostname,
    path: stringOption(options, "path") ?? urlPath(url),
    method: stringOption(options, "method") ?? "GET",
    headers: targetHeaders(options),
  };
}

function urlPath(url: URL | undefined): string {
  return url === undefined ? "/" : `${url.pathname}${url.search}`;
}

function requestUrl(value: unknown): URL | undefined {
  if (value instanceof URL) {
    return value;
  }

  return typeof value === "string"
    ? (URL.parse(value) ?? undefined)
    : undefined;
}

/**
 * The hostname a request names, from the URL or from the options.
 *
 * `host` carries a port where `hostname` does not, and the two are otherwise
 * interchangeable, so the port is dropped to leave a name either way.
 */
function targetHostname(
  options: unknown,
  url: URL | undefined,
): string | undefined {
  const hostname =
    stringOption(options, "hostname") ?? stringOption(options, "host");
  if (hostname !== undefined) {
    return hostname.replace(/:\d+$/, "");
  }

  return url?.hostname;
}

/**
 * The request headers, named in lower case.
 *
 * HTTP header names are case-insensitive, and what reads them here looks each
 * one up by name, so the case a caller happened to use is settled once.
 */
function targetHeaders(options: unknown): Record<string, string> {
  const headers = isRecord(options) ? options["headers"] : undefined;
  if (!isRecord(headers)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([name, value]) => [
        name.toLowerCase(),
        Array.isArray(value) ? value.join(",") : String(value),
      ]),
  );
}

function stringOption(options: unknown, name: string): string | undefined {
  if (!isRecord(options)) {
    return undefined;
  }

  // oxlint-disable-next-line security/detect-object-injection -- one of this module's own literal option names.
  const value = options[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
