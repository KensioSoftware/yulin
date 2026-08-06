import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
  SimAwsServiceTarget,
} from "../../../serve/controller/sim-service-controller.js";
import { SimAws } from "../../aws/sim-aws.js";
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

/**
 * The segments a request can name after the pool id.
 */
const servedSegments = new Set([wellKnownSegment, messagesSegment]);

/**
 * The methods a published document is read with.
 */
const readMethods = new Set(["GET", "HEAD"]);

interface SimCognitoServiceControllerProperties {
  readonly simAws?: SimAws;
}

/**
 * The parts of a request that decide which document it is asking for.
 */
interface SimCognitoServedRequest {
  readonly segment: string;
  readonly document: string | undefined;
  readonly url: URL;
  readonly method: string;
}

/**
 * Localhost HTTP controller for the public endpoints of a simulated user pool,
 * and for the messages the pool would have sent.
 *
 * Real Cognito serves a pool's JWKS and its OpenID configuration to anyone,
 * with no SigV4 signature, because a token verifier holding no AWS credentials
 * has to be able to fetch them. Both are anonymous here for the same reason,
 * so a verifier pointed at the local URL fetches keys the way it does against
 * real Cognito rather than being handed them.
 *
 * The recorded messages are listed at `/<userPoolId>/messages`, which real
 * Cognito serves nothing at. Nothing here delivers a message, so this is where
 * one is read during local development.
 *
 * The Cognito API itself is not served. An SDK client reaches the simulator
 * through `SimSdk` rather than through an endpoint override.
 */
export class SimCognitoServiceController implements SimAwsServiceController {
  private readonly simAws: SimAws;
  private readonly openIdConfiguration = new SimCognitoOpenIdConfiguration();
  private readonly response = new SimCognitoEndpointResponse();

  constructor(properties: SimCognitoServiceControllerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.simAws = simAws;
  }

  /**
   * Handle an HTTP request routed to a simulated Cognito regional endpoint.
   */
  handleRequest(serviceRequest: SimAwsServiceRequest): Promise<Response> {
    return Promise.resolve(this.respond(serviceRequest));
  }

  private respond(serviceRequest: SimAwsServiceRequest): Response {
    const { request } = serviceRequest;
    const url = new URL(request.url);

    if (!readMethods.has(request.method)) {
      return this.response.notRead(request.method);
    }

    // A path is exactly '<userPoolId>/.well-known/<document>' or
    // '<userPoolId>/messages'. Anything longer is a path nothing is served at,
    // rather than a prefix of one that is.
    const [userPoolId, segment, document, ...rest] = url.pathname
      .slice(1)
      .split("/");

    if (
      userPoolId === undefined ||
      userPoolId.length === 0 ||
      segment === undefined ||
      !servedSegments.has(segment) ||
      rest.length > 0
    ) {
      return this.response.noSuchEndpoint(url.pathname);
    }

    const pool = this.servedPool(userPoolId, serviceRequest.target);

    if (pool === undefined) {
      return this.response.noSuchUserPool(userPoolId);
    }

    return this.served(pool, {
      segment,
      document,
      url,
      method: request.method,
    });
  }

  /**
   * The document a request names, or nothing served at that path.
   */
  private served(
    pool: SimCognitoUserPool,
    request: SimCognitoServedRequest,
  ): Response {
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

  /**
   * Find the pool a request names, if this endpoint serves it.
   *
   * A pool id is unique across the simulation and says nothing about the
   * Account that owns the pool, so the lookup spans Accounts. It does name the
   * pool's region, and real Cognito serves a pool only on that region's
   * endpoint, so a pool reached through another region's hostname is not
   * found here either.
   */
  private servedPool(
    userPoolId: string,
    target: SimAwsServiceTarget,
  ): SimCognitoUserPool | undefined {
    const pool = this.simAws
      .cognitoIdentityProvider()
      .findUserPoolInAnyAccount(userPoolId);

    if (pool === undefined) {
      return undefined;
    }

    const [poolRegionName] = pool.id.split("_", 1);

    if (poolRegionName !== target.regionName) {
      return undefined;
    }

    return pool;
  }
}
