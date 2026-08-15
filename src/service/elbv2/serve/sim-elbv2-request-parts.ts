import { simAwsRequestHostname } from "../../../serve/http/url/sim-aws-request-hostname.js";

interface SimElbV2ProxiedRequest {
  readonly request: Request;
  /** The port the listener taking the request answers on. */
  readonly port: number;
  /** The protocol that listener speaks, lowercased for the header. */
  readonly protocol: string;
  readonly traceId: string;
  readonly sourceIp: string;
}

/**
 * Reads the parts of an HTTP request an ALB invocation event delivers in its
 * own fields.
 *
 * Keeping this separate leaves the event builder to assemble the event from
 * parts, without also owning the header and query conventions, which are ELB's
 * own rather than either API Gateway payload format's.
 */
export class SimElbV2RequestParts {
  /**
   * Collect request headers, which an ALB event delivers as single lowercased
   * values.
   *
   * Cookies stay in the `cookie` header they arrived in, unlike payload format
   * 2.0, which lifts them into a field of their own. The four headers ELB adds
   * are set rather than merged: ELB terminates the connection itself and
   * writes them before the target sees them, so whatever a client sent under
   * those names does not survive.
   */
  headers(proxied: SimElbV2ProxiedRequest): Record<string, string> {
    // Fetch API header names are already lowercased, which is the case an ALB
    // event delivers them in.
    const headers = new Map<string, string>();
    proxied.request.headers.forEach((value, name) => {
      headers.set(name, value);
    });

    // The host name the request named on real AWS, which is the load balancer's
    // own DNS name or whatever Route53 name resolved to it, rather than the
    // localhost one a served request arrived at.
    headers.set("host", simAwsRequestHostname(proxied.request));
    headers.set("x-amzn-trace-id", proxied.traceId);
    headers.set("x-forwarded-for", this.forwardedFor(headers, proxied));
    headers.set("x-forwarded-port", String(proxied.port));
    headers.set("x-forwarded-proto", proxied.protocol.toLowerCase());

    return Object.fromEntries(headers);
  }

  /**
   * Collect query string parameters, keeping the last value of a repeated key.
   *
   * The last-value rule is ELB's, and it is what the multi-value headers target
   * group attribute exists to turn off. API Gateway joins repeated values with
   * commas instead.
   *
   * The query string is read as it arrived rather than through URLSearchParams,
   * because real ELB does not decode percent escapes and leaves decoding to the
   * function. A handler therefore reads `a%2Bb` as it was sent, rather than the
   * `a+b` that decoding it here would produce.
   */
  queryStringParameters(url: URL): Record<string, string> {
    const parameters = new Map<string, string>();

    for (const pair of url.search.replace(/^\?/u, "").split("&")) {
      if (pair === "") {
        continue;
      }

      parameters.set(...this.queryPair(pair, pair.indexOf("=")));
    }

    return Object.fromEntries(parameters);
  }

  /**
   * Split one query string pair, where a key on its own has an empty value.
   */
  private queryPair(pair: string, separator: number): [string, string] {
    if (separator === -1) {
      return [pair, ""];
    }

    return [pair.slice(0, separator), pair.slice(separator + 1)];
  }

  /**
   * The `x-forwarded-for` header the target sees.
   *
   * Real ELB appends the client's address to whatever the request already
   * carried, which is what makes the header a chain of proxies rather than one
   * address. The other forwarding headers are overwritten, because those
   * describe the connection this load balancer terminated.
   */
  private forwardedFor(
    headers: ReadonlyMap<string, string>,
    proxied: SimElbV2ProxiedRequest,
  ): string {
    const forwarded = headers.get("x-forwarded-for");

    if (forwarded === undefined || forwarded === "") {
      return proxied.sourceIp;
    }

    return `${forwarded}, ${proxied.sourceIp}`;
  }
}
