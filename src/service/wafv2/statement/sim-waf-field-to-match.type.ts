import type { SimWafMatchPatternInput } from "./sim-waf-request-fields.js";

/**
 * The parts of a request a WAFv2 rule can be pointed at, in the API's own
 * shape.
 *
 * The members Yulin does not simulate are declared here rather than left out,
 * so a rule that names one is refused by name instead of being read as a rule
 * with no field at all.
 */
export interface SimWafFieldToMatchInput {
  readonly UriPath?: unknown;
  readonly QueryString?: unknown;
  readonly Method?: unknown;
  readonly AllQueryArguments?: unknown;
  readonly SingleQueryArgument?: SimWafNamedFieldInput | undefined;
  readonly SingleHeader?: SimWafNamedFieldInput | undefined;
  readonly Headers?: SimWafHeadersFieldInput | undefined;
  readonly Cookies?: SimWafHeadersFieldInput | undefined;
  readonly Body?:
    | { readonly OversizeHandling?: string | undefined }
    | undefined;
  readonly JsonBody?: unknown;
  readonly HeaderOrder?: unknown;
  readonly JA3Fingerprint?: unknown;
  readonly JA4Fingerprint?: unknown;
  readonly UriFragment?: unknown;
}

/**
 * A field that names the one header or query argument it reads.
 */
export interface SimWafNamedFieldInput {
  readonly Name?: string | undefined;
}

/**
 * A field that reads a set of headers or cookies.
 */
export interface SimWafHeadersFieldInput {
  readonly MatchPattern?: SimWafMatchPatternInput | undefined;
  readonly MatchScope?: string | undefined;
  readonly OversizeHandling?: string | undefined;
}
