interface SimElbV2ProxiedRequest {
  readonly request: Request;
  /** The DNS name of the load balancer the request reached. */
  readonly dnsName: string;
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

    // The load balancer's own DNS name, not the localhost one the request
    // arrived at, because that is the host name the request named on real AWS.
    headers.set("host", proxied.dnsName);
    headers.set("x-amzn-trace-id", proxied.traceId);
    headers.set("x-forwarded-for", proxied.sourceIp);
    headers.set("x-forwarded-port", String(proxied.port));
    headers.set("x-forwarded-proto", proxied.protocol.toLowerCase());

    return Object.fromEntries(headers);
  }

  /**
   * Collect query string parameters, keeping the last value of a repeated key.
   *
   * That last-value rule is ELB's, and it is what the `multiValueHeaders`
   * target group attribute exists to turn off. It differs from API Gateway,
   * which joins repeated values with commas.
   */
  queryStringParameters(url: URL): Record<string, string> {
    const parameters = new Map<string, string>(url.searchParams);

    return Object.fromEntries(parameters);
  }
}
