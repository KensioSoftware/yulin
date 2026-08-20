import type { SimCognitoUserPool } from "../user-pool/sim-cognito-user-pool.js";
import { SimCognitoEndpointResponse } from "./sim-cognito-endpoint-response.js";
import { SimCognitoOpenIdConfiguration } from "./sim-cognito-openid-configuration.js";

/**
 * The path segment both public pool endpoints sit under.
 */
const wellKnownSegment = ".well-known";

/**
 * The path segment the recorded messages are listed under.
 *
 * Real Cognito serves nothing here. It is the serving side of
 * `SimCognitoUserPool.sentMessages`, so that a browser or a curl can read what
 * a pool would have sent during local development, and it is a divergence for
 * the same reason that accessor is one: nothing here delivers a message.
 */
const messagesSegment = "messages";

const servedSegments = new Set([wellKnownSegment, messagesSegment]);

/**
 * The parts of a request that decide which document it is asking for.
 */
export interface SimCognitoServedRequest {
  readonly segment: string;
  readonly document: string | undefined;
  readonly url: URL;
  readonly method: string;
}

/**
 * Whether a path segment after the pool id names anything this endpoint
 * serves.
 */
export function simCognitoServesSegment(segment: string): boolean {
  return servedSegments.has(segment);
}

/**
 * Whether a web ACL in front of the pool is evaluated for a path segment.
 *
 * AWS WAF inspects every user pool endpoint, and the two `.well-known`
 * documents are user pool endpoints. The recorded messages are a path of this
 * simulation's own, and no web ACL on AWS has an opinion about it.
 */
export function simCognitoProtectedSegment(segment: string): boolean {
  return segment === wellKnownSegment;
}

/**
 * The documents a pool publishes on the regional endpoint.
 *
 * Real Cognito serves the JWKS and the OpenID configuration to anyone, with no
 * SigV4 signature, because a token verifier holding no AWS credentials has to
 * be able to fetch them. Both are anonymous here for the same reason. The
 * messages listing sits beside them and is Yulin's own.
 */
export class SimCognitoPoolDocuments {
  private readonly openIdConfiguration = new SimCognitoOpenIdConfiguration();
  private readonly response = new SimCognitoEndpointResponse();

  /**
   * The document a request names, or nothing served at that path.
   */
  serve(pool: SimCognitoUserPool, request: SimCognitoServedRequest): Response {
    const { segment, document, url, method } = request;

    // The listing is the whole of what the messages segment serves, and the
    // two published documents sit under `.well-known` and nowhere else, so a
    // path that mixes the two reaches neither.
    if (segment === messagesSegment && document === undefined) {
      return this.response.document(
        { messages: pool.sentMessages().map((message) => message.toOutput()) },
        method,
      );
    }

    if (segment !== wellKnownSegment) {
      return this.response.noSuchEndpoint(url.pathname);
    }

    if (document === "jwks.json") {
      return this.response.document(pool.jwks(), method);
    }

    if (document === "openid-configuration") {
      return this.response.document(
        this.openIdConfiguration.document(pool, url.origin),
        method,
      );
    }

    return this.response.noSuchEndpoint(url.pathname);
  }
}
