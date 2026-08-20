import type { SimWafHeader } from "../web-acl/sim-waf-custom-response.type.js";

/**
 * What a blocked request is answered with.
 */
export interface SimWafBlockedResponse {
  readonly statusCode: number;
  readonly contentType: string;
  readonly body: string;
  readonly headers: readonly SimWafHeader[];
}

/**
 * The body a block action with no custom response of its own answers with.
 *
 * Real WAF hands the blocking off to whatever the web ACL is in front of, and
 * each of them writes its own page. CloudFront writes an error page and API
 * Gateway writes `{"message":"Forbidden"}`. This is the simulator's own body
 * for all of them, which is a deliberate divergence recorded in
 * `docs/services/wafv2`. The status is the 403 every one of them answers with,
 * and a rule with a custom response replaces this whole thing anyway.
 */
export function simWafDefaultBlockedResponse(): SimWafBlockedResponse {
  return {
    statusCode: 403,
    contentType: "text/html",
    body:
      "<html><head><title>403 Forbidden</title></head>" +
      "<body>Request blocked by AWS WAF.</body></html>",
    headers: [],
  };
}

/**
 * Turn a blocked verdict into the HTTP response to send.
 *
 * This is what a serving path uses once a web ACL is in front of it, so the
 * status, the body and the headers a custom response named all reach the
 * client together.
 */
export function simWafBlockedHttpResponse(
  blocked: SimWafBlockedResponse,
): Response {
  const headers = new Headers({ "content-type": blocked.contentType });

  for (const header of blocked.headers) {
    headers.set(header.name, header.value);
  }

  return new Response(blocked.body, {
    status: blocked.statusCode,
    headers,
  });
}
