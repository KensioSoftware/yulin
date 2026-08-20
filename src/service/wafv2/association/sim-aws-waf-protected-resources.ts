import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimWafProtectedResource } from "./sim-waf-protected-resource.js";
import type { SimWafProtectedResources } from "./sim-waf-protected-resources.js";

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
 * found.
 */
export class SimAwsWafProtectedResources implements SimWafProtectedResources {
  readonly #simAws: SimAws;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimAwsWafProtectedResourcesProperties) {
    this.#simAws = properties.simAws;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Whether the REST API stage an ARN names is one this scope holds.
   */
  has(resource: SimWafProtectedResource): boolean {
    const { accountId, regionName } = this.#accountRegionScope;
    const restApi = this.#simAws
      .accountRegionScope(accountId, regionName)
      .apiGateway()
      .findRestApi(resource.restApiId);

    return restApi?.stages.find(resource.stageName) !== undefined;
  }
}
