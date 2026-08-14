import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCognitoUserPoolDomain } from "../user-pool/domain/sim-cognito-user-pool-domain.js";
import type { SimCognitoUserPool } from "../user-pool/sim-cognito-user-pool.js";
import { simCognitoUserPoolRegionName } from "../user-pool/sim-cognito-user-pool-id.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";
import { SimCognitoDomainEndpoints } from "./sim-cognito-domain-endpoints.js";

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
 */
export class SimCognitoDomainController {
  private readonly simAws: SimAws;
  private readonly endpoints = new SimCognitoDomainEndpoints();

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

    const url = new URL(serviceRequest.request.url);
    const pool = this.pool(domain);

    return await this.endpoints.handleRequest({
      pool,
      cognito: this.cognitoFor(pool),
      serviceRequest,
      url,
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

  /**
   * The simulated Cognito scope that owns a pool.
   *
   * The Account comes from the pool's ARN and the Region from its id, and each
   * scope's services are made once and kept, so this is the same service
   * object that created the pool rather than another view of it.
   */
  private cognitoFor(pool: SimCognitoUserPool): SimCognitoIdentityProvider {
    return this.simAws
      .account(pool.arn.accountId)
      .region(simCognitoUserPoolRegionName(pool.id) as AwsRegionName)
      .cognitoIdentityProvider();
  }
}
