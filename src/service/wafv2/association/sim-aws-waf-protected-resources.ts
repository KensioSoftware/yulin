import type {
  SimAwsAccountRegionContainer,
  SimAwsAccountRegionScope,
} from "../../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimWafProtectedResource } from "./sim-waf-protected-resource.js";
import type { SimWafProtectedResources } from "./sim-waf-protected-resources.js";
import type { SimWafRestApiStage } from "./sim-waf-rest-api-stage.js";
import type { SimWafUserPool } from "./sim-waf-user-pool.js";

interface SimAwsWafProtectedResourcesProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The resources of one simulated AWS instance a web ACL can be put in front
 * of.
 *
 * The lookup is made in the Account and Region the WAFv2 handling the request
 * belongs to. A stage ARN names no Account, and AWS WAF associates within one
 * Account, so a stage created elsewhere in the simulation is not there to be
 * found. A user pool ARN does name an Account, and one naming another Account
 * was already refused before the lookup.
 */
export class SimAwsWafProtectedResources implements SimWafProtectedResources {
  readonly #simAws: SimAws;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimAwsWafProtectedResourcesProperties) {
    this.#simAws = properties.simAws;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Whether the resource an ARN names is one this scope holds.
   */
  has(resource: SimWafProtectedResource): boolean {
    if (resource.resourceType === "COGNITO_USER_POOL") {
      return this.hasUserPool(resource);
    }

    return this.hasRestApiStage(resource);
  }

  /**
   * Whether this scope holds the REST API stage an ARN names.
   */
  private hasRestApiStage(resource: SimWafRestApiStage): boolean {
    const restApi = this.scope().apiGateway().findRestApi(resource.restApiId);

    return restApi?.stages.find(resource.stageName) !== undefined;
  }

  /**
   * Whether this scope holds the user pool an ARN names.
   *
   * The ARN is compared rather than the id alone. A pool id is unique across
   * the whole simulation, so a pool this scope does not hold is simply not
   * found, and comparing the ARN says the same thing about a pool id that is
   * there under a different Account.
   */
  private hasUserPool(resource: SimWafUserPool): boolean {
    const pool = this.scope()
      .cognitoIdentityProvider()
      .findUserPool(resource.userPoolId);

    return pool?.arn.value === resource.arn;
  }

  /**
   * The simulated services of the Account and Region this WAFv2 belongs to.
   */
  private scope(): SimAwsAccountRegionContainer {
    const { accountId, regionName } = this.#accountRegionScope;

    return this.#simAws.accountRegionScope(accountId, regionName);
  }
}
