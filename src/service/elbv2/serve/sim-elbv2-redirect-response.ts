import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimElbV2Action } from "../action/sim-elbv2-action.js";
import { simElbV2MatchableRequest } from "../listener/rule/match/sim-elbv2-matchable-request.js";
import type { SimElbV2Listener } from "../listener/sim-elbv2-listener.js";
import {
  SimElbV2RedirectLocation,
  type SimElbV2RequestUri,
} from "./sim-elbv2-redirect-location.js";

interface SimElbV2RedirectInput {
  readonly action: SimElbV2Action;
  readonly listener: SimElbV2Listener;
  readonly request: Request;
}

/**
 * Answers a request with a listener or rule's `redirect` action.
 *
 * Like a fixed response this needs no target, which is why it is the usual way
 * to send HTTP to HTTPS: a listener on port 80 can redirect without anything
 * being registered behind it.
 */
export class SimElbV2RedirectResponse {
  /**
   * Build the response one redirect action sends.
   */
  respond(input: SimElbV2RedirectInput): Response {
    const config = input.action.redirect;

    // A redirect action is created with a configuration and a status code, so
    // a stored one always has both.
    assertDefined(
      config,
      `Simulated ELBv2 redirect action holds no RedirectConfig`,
    );
    assertDefined(
      config.StatusCode,
      `Simulated ELBv2 redirect action holds no StatusCode`,
    );

    const location = new SimElbV2RedirectLocation(this.uri(input)).build(
      config,
    );

    // The status code is written as HTTP_301 or HTTP_302, which is the form
    // ELB takes it in rather than the number it sends.
    return new Response(null, {
      status: Number(config.StatusCode.replace("HTTP_", "")),
      headers: { location },
    });
  }

  /**
   * The URI the request arrived at, which is what an unnamed component of the
   * redirect keeps.
   *
   * The protocol and port are the listener's rather than the URL's, because
   * they are what the load balancer answered on. Nothing here performs TLS, so
   * a URL can name a scheme the listener does not speak.
   */
  private uri(input: SimElbV2RedirectInput): SimElbV2RequestUri {
    const { host, path } = simElbV2MatchableRequest(input.request);

    return {
      protocol: input.listener.protocol,
      host,
      port: String(input.listener.port),
      path,
      query: new URL(input.request.url).search.replace(/^\?/u, ""),
    };
  }
}
