import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
  SimAwsServiceTarget,
} from "../../../serve/controller/sim-service-controller.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimCognitoUserPool } from "../user-pool/sim-cognito-user-pool.js";
import { SimCognitoDomainController } from "./sim-cognito-domain-controller.js";
import { SimCognitoEndpointResponse } from "./sim-cognito-endpoint-response.js";
import { simCognitoPoolScope } from "./sim-cognito-pool-scope.js";
import {
  SimCognitoPoolDocuments,
  simCognitoProtectedSegment,
  simCognitoServesSegment,
} from "./sim-cognito-pool-documents.js";
import { SimCognitoWebAclInspection } from "./sim-cognito-web-acl-inspection.js";

/**
 * The methods a published document is read with.
 */
const readMethods = new Set(["GET", "HEAD"]);

interface SimCognitoServiceControllerProperties {
  readonly simAws?: SimAws;
}

/**
 * Localhost HTTP controller for the public endpoints of a simulated user pool,
 * and for the messages the pool would have sent.
 *
 * `SimCognitoPoolDocuments` answers with the pool's JWKS, its OpenID
 * configuration and the messages listing, and this is the routing in front of
 * it: the method, the path and the pool the path names.
 *
 * A pool's hosted domain is served too, on its own hostname rather than on the
 * regional endpoint, and `SimCognitoDomainController` answers those requests.
 * That is where the OAuth endpoints of an authorization code grant live.
 *
 * A web ACL in front of the pool decides a request to either of the
 * `.well-known` documents before the document is read.
 *
 * The Cognito API itself is not served. An SDK client reaches the simulator
 * through `SimSdk` rather than through an endpoint override.
 */
export class SimCognitoServiceController implements SimAwsServiceController {
  private readonly simAws: SimAws;
  private readonly documents = new SimCognitoPoolDocuments();
  private readonly response = new SimCognitoEndpointResponse();
  private readonly domainController: SimCognitoDomainController;
  private readonly webAcl = new SimCognitoWebAclInspection();

  constructor(properties: SimCognitoServiceControllerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.simAws = simAws;
    this.domainController = new SimCognitoDomainController({ simAws });
  }

  /**
   * Handle an HTTP request routed to a simulated Cognito regional endpoint.
   */
  async handleRequest(serviceRequest: SimAwsServiceRequest): Promise<Response> {
    // A request that reached a hosted domain's hostname names that domain,
    // where one to the regional endpoint names no resource at all.
    const domainResponse =
      await this.domainController.handleRequest(serviceRequest);

    return domainResponse ?? (await this.respond(serviceRequest));
  }

  private async respond(
    serviceRequest: SimAwsServiceRequest,
  ): Promise<Response> {
    const { request } = serviceRequest;
    const url = new URL(request.url);

    // A path is exactly '<userPoolId>/.well-known/<document>' or
    // '<userPoolId>/messages'. Anything longer is a path nothing is served at,
    // rather than a prefix of one that is.
    const [userPoolId, segment, document, ...rest] = url.pathname
      .slice(1)
      .split("/");

    if (
      userPoolId === undefined ||
      userPoolId === "" ||
      segment === undefined ||
      !simCognitoServesSegment(segment) ||
      rest.length > 0
    ) {
      return this.response.noSuchEndpoint(url.pathname);
    }

    const pool = this.servedPool(userPoolId, serviceRequest.target);

    if (pool === undefined) {
      return this.response.noSuchUserPool(userPoolId);
    }

    // The web ACL sits in front of the endpoint rather than behind it, so a
    // request it blocks is answered before the method is judged. A write the
    // rules turned away gets WAF's 403 and never learns the endpoint reads.
    const blocked = await this.blocked(pool, segment, request);

    if (blocked !== undefined) {
      return blocked;
    }

    if (!readMethods.has(request.method)) {
      return this.response.notRead(request.method);
    }

    return this.documents.serve(pool, {
      segment,
      document,
      url,
      method: request.method,
    });
  }

  /**
   * What the web ACL in front of a pool answers a request with, when it blocks
   * it.
   *
   * A blocked request is answered before the document is read, so a verifier
   * the rules turn away gets 403 and no keys.
   */
  private async blocked(
    pool: SimCognitoUserPool,
    segment: string,
    request: Request,
  ): Promise<Response | undefined> {
    if (!simCognitoProtectedSegment(segment)) {
      return undefined;
    }

    const inspected = await this.webAcl.inspect({
      pool,
      cognito: simCognitoPoolScope(this.simAws, pool),
      request,
    });

    return inspected.blocked;
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
