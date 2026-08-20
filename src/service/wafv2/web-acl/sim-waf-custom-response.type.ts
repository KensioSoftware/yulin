/**
 * One header WAF adds to what it sends back, or to what it forwards.
 */
export interface SimWafHeader {
  readonly name: string;
  readonly value: string;
}

/**
 * Minimal structural WAFv2 CustomHTTPHeader.
 */
export interface SimWafCustomHeaderInput {
  readonly Name?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * Minimal structural WAFv2 CustomResponse.
 */
export interface SimWafCustomResponseInput {
  readonly ResponseCode?: number | undefined;
  readonly CustomResponseBodyKey?: string | undefined;
  readonly ResponseHeaders?: readonly SimWafCustomHeaderInput[] | undefined;
}

/**
 * Minimal structural WAFv2 CustomRequestHandling.
 */
export interface SimWafCustomRequestHandlingInput {
  readonly InsertHeaders?: readonly SimWafCustomHeaderInput[] | undefined;
}

/**
 * Minimal structural WAFv2 CustomResponseBody.
 */
export interface SimWafCustomResponseBodyInput {
  readonly ContentType?: string | undefined;
  readonly Content?: string | undefined;
}

/**
 * The bodies a web ACL's block actions can answer with, by the key they are
 * held under.
 */
export type SimWafCustomResponseBodies = Readonly<
  Record<string, SimWafCustomResponseBodyInput>
>;

/**
 * One body a block action answers with, ready to send.
 */
export interface SimWafResponseBody {
  readonly contentType: string;
  readonly content: string;
}
