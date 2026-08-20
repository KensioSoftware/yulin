import type { SimWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import { simWafInspectionLimitBytes } from "../statement/sim-waf-field-content.js";
import { simWafQueryArguments } from "../statement/sim-waf-request-fields.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * The request components an AWS managed rule inspects.
 *
 * A managed rule names the component it reads rather than carrying a field to
 * match, so these are read once per request and handed to every rule in the
 * group. The sizes are here because the four `SizeRestrictions_*` rules
 * measure a component rather than looking inside it, and they measure bytes
 * rather than characters.
 */
export interface SimWafManagedRequestParts {
  readonly method: string;

  /** The AWS-facing hostname, which `Host_localhost_HEADER` reads. */
  readonly host: string;

  readonly uriPath: string;
  readonly queryString: string;

  /** The value of each query argument, undecoded. */
  readonly queryArguments: readonly string[];

  /** The value of each header the request sent. */
  readonly headerValues: readonly string[];

  /** The User-Agent header, or nothing when the request sent none. */
  readonly userAgent: string | undefined;

  /** The whole Cookie header, as it arrived. */
  readonly cookieHeader: string;

  /** As much of the body as WAF reads, decoded as text. */
  readonly body: string;

  readonly uriPathBytes: number;
  readonly queryStringBytes: number;
  readonly cookieHeaderBytes: number;
  readonly bodyBytes: number;
}

/**
 * Read the components the managed rules inspect out of one request.
 *
 * The body is cut at WAF's inspection limit for the rules that look inside it,
 * and its full size is kept beside it for `SizeRestrictions_BODY`. WAF knows
 * how large a body is from the request whether or not it reads that far, so a
 * body over the limit is measured rather than being reported as the limit.
 */
export function simWafManagedRequestParts(
  request: SimWafInspectedRequest,
): SimWafManagedRequestParts {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const body = request.body ?? new Uint8Array();

  return {
    method: request.method,
    host: request.host,
    uriPath: request.uriPath,
    queryString: request.queryString,
    queryArguments: simWafQueryArguments(request.queryString).map(
      (argument) => argument.value,
    ),
    headerValues: [...request.headers].map(([, value]) => value),
    userAgent: request.headers.get("user-agent") ?? undefined,
    cookieHeader,
    body: decoder.decode(body.subarray(0, simWafInspectionLimitBytes)),
    uriPathBytes: simWafByteLength(request.uriPath),
    queryStringBytes: simWafByteLength(request.queryString),
    cookieHeaderBytes: simWafByteLength(cookieHeader),
    bodyBytes: body.length,
  };
}

/**
 * How many bytes a string takes up, which is what WAF measures a component in.
 */
export function simWafByteLength(value: string): number {
  return encoder.encode(value).length;
}
