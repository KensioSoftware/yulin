import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimCfnParameterStoreReader } from "./sim-cfn-parameter-store.type.js";

interface MakeSimCfnParameterStoreProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The simulated Parameter Store a Stack's typed Parameters are read from.
 *
 * One Account and Region, the Stack's own, as real CloudFormation reads them.
 * A Parameter naming configuration held in another Region is a Parameter this
 * store cannot answer.
 */
export function makeSimCfnParameterStore(
  properties: MakeSimCfnParameterStoreProperties,
): SimCfnParameterStoreReader {
  const { simAws, accountRegionScope } = properties;

  return simAws
    .accountRegionScope(
      accountRegionScope.accountId,
      accountRegionScope.regionName,
    )
    .ssm()
    .cfnParameterValueReader();
}
