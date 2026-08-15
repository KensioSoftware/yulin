import {
  simAwsProxiedSourceIp,
  simAwsProxiedTraceId,
} from "../../../serve/http/sim-aws-proxied-connection.js";
import { simAwsRequestHostname } from "../../../serve/http/url/sim-aws-request-hostname.js";
import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimElbV2Listener } from "../listener/sim-elbv2-listener.js";
import { SimElbV2RequestParts } from "./sim-elbv2-request-parts.js";

interface SimElbV2ForwardedRequestProperties {
  /** Clock the forwarded trace id is stamped with. */
  readonly clock: SimClock;
}

interface SimElbV2ForwardedRequestInput {
  readonly request: Request;
  readonly listener: SimElbV2Listener;
}

/**
 * Builds the request a load balancer forwards to a container target.
 *
 * A Lambda target gets an event, and a container gets the request itself, so
 * this is the container's half of what the event builder does: the same host
 * name, the same trace id and the same forwarding headers, applied to a request
 * rather than gathered into a payload. Keeping the rules in
 * `SimElbV2RequestParts` for both is what stops a container and a function
 * behind the same listener disagreeing about what the client asked for.
 *
 * The URL is rewritten to the AWS-facing one, so a container reading
 * `request.url` sees the name the client asked for rather than the localhost
 * one a served request arrived at, and sees the listener's scheme and port
 * rather than the local server's.
 */
export class SimElbV2ForwardedRequest {
  private readonly requestParts = new SimElbV2RequestParts();
  private readonly clock: SimClock;

  constructor(properties: SimElbV2ForwardedRequestProperties) {
    this.clock = properties.clock;
  }

  /**
   * Build the request one container target is handed.
   */
  build(input: SimElbV2ForwardedRequestInput): Request {
    const { request, listener } = input;
    const forwarded = new Request(this.urlFor(input), request);
    const headers = this.requestParts.headers({
      request,
      port: listener.port,
      protocol: listener.protocol,
      traceId: simAwsProxiedTraceId(this.clock.now()),
      sourceIp: simAwsProxiedSourceIp,
    });

    for (const [name, value] of Object.entries(headers)) {
      forwarded.headers.set(name, value);
    }

    return forwarded;
  }

  /**
   * The URL the forwarded request carries.
   *
   * A port the listener's own scheme is served on drops out of its own accord,
   * as it does in any URL, so a listener on 80 forwards a request to
   * `http://name/path` rather than to `http://name:80/path`.
   */
  private urlFor(input: SimElbV2ForwardedRequestInput): string {
    const { request, listener } = input;
    const scheme = listener.protocol.toLowerCase();
    const forwarded = new URL(`${scheme}://${simAwsRequestHostname(request)}/`);
    const asked = new URL(request.url);

    forwarded.port = String(listener.port);
    forwarded.pathname = asked.pathname;
    forwarded.search = asked.search;

    return forwarded.href;
  }
}
