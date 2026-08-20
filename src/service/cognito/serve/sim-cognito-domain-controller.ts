import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCognitoUserPoolDomain } from "../user-pool/domain/sim-cognito-user-pool-domain.js";
import type { SimCognitoUserPool } from "../user-pool/sim-cognito-user-pool.js";
import { SimCognitoDomainEndpoints } from "./sim-cognito-domain-endpoints.js";
import { simCognitoPoolScope } from "./sim-cognito-pool-scope.js";
import { SimCognitoWebAclInspection } from "./sim-cognito-web-acl-inspection.js";

interface SimCognitoDomainControllerProperties {
  readonly simAws: SimAws;
}

/**
 * The localhost HTTP side of a pool's hosted domain.
 *
 * These are the endpoints a browser and an application's own server reach, and
 * they carry no AWS credentials at all: an authorization code grant is signed
 * by nobody, in the same way `InitiateAuth` is. What authenticates the
 * application is its app client secret, at the token endpoint.
 *
 * The pool's own scope answers each request, found from the domain rather than
 * assumed to be the default one, because a domain names a pool that any
 * Account and Region of the simulation could have created.
 *
 * A web ACL in front of the pool sees the request before any of the endpoints
 * do, as it does on real Cognito. A blocked request is answered with 403 and
 * reaches no endpoint.
 */
export class SimCognitoDomainController {
  private readonly simAws: SimAws;
  private readonly endpoints = new SimCognitoDomainEndpoints();
  private readonly webAcl = new SimCognitoWebAclInspection();

  constructor(properties: SimCognitoDomainControllerProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Handle a request that reached a hosted domain's hostname, or answer
   * nothing for one that named no domain at all.
   *
   * A request to the regional endpoint names no resource, and that is what
   * tells the two apart.
   */
  async handleRequest(
    serviceRequest: SimAwsServiceRequest,
  ): Promise<Response | undefined> {
    const domain = this.servedDomain(serviceRequest);

    if (domain === undefined) {
      return undefined;
    }

    const pool = this.pool(domain);
    const cognito = simCognitoPoolScope(this.simAws, pool);
    const inspected = await this.webAcl.inspect({
      pool,
      cognito,
      request: serviceRequest.request,
    });

    if (inspected.blocked !== undefined) {
      return inspected.blocked;
    }

    return await this.endpoints.handleRequest({
      pool,
      cognito,
      serviceRequest: forwarded(serviceRequest, inspected.request),
      url: new URL(inspected.request.url),
    });
  }

  /**
   * The hosted domain a request arrived at, if it arrived at one.
   */
  private servedDomain(
    serviceRequest: SimAwsServiceRequest,
  ): SimCognitoUserPoolDomain | undefined {
    const { resourceName } = serviceRequest.target;

    if (resourceName === "") {
      return undefined;
    }

    return this.simAws
      .cognitoIdentityProvider()
      .findUserPoolDomainInAnyAccount(resourceName);
  }

  /**
   * The pool a hosted domain belongs to.
   */
  private pool(domain: SimCognitoUserPoolDomain): SimCognitoUserPool {
    const pool = this.simAws
      .cognitoIdentityProvider()
      .findUserPoolInAnyAccount(domain.userPoolId);

    assertDefined(
      pool,
      `sim Cognito user pool ${domain.userPoolId} for domain ${domain.value}`,
    );

    return pool;
  }
}

/**
 * The request the endpoints answer, as the web ACL asked for it to be
 * forwarded.
 *
 * A rule with custom request handling adds headers to what reaches the origin,
 * and the hosted domain is the origin here. An allowed request no rule touched
 * is the one that arrived.
 */
function forwarded(
  serviceRequest: SimAwsServiceRequest,
  request: Request,
): SimAwsServiceRequest {
  if (request === serviceRequest.request) {
    return serviceRequest;
  }

  return new SimAwsServiceRequest({
    target: serviceRequest.target,
    request,
    caller: serviceRequest.caller,
    source: serviceRequest.source,
    body: serviceRequest.body,
  });
}
