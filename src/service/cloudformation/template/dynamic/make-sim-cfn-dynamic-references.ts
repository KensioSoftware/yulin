import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimCfnPropertyIgnorer } from "../../resource/ignore/sim-cfn-ignored-property.type.js";
import { SimCfnDynamicReferences } from "./sim-cfn-dynamic-references.js";
import { simCfnDynamicReferenceResolvers } from "./sim-cfn-dynamic-reference-resolvers.js";

interface MakeSimCfnDynamicReferencesProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly propertyIgnorer?: SimCfnPropertyIgnorer | undefined;
}

/**
 * Build the dynamic reference resolvers for one Account and Region scope.
 */
export function makeSimCfnDynamicReferences(
  properties: MakeSimCfnDynamicReferencesProperties,
): SimCfnDynamicReferences {
  const { simAws, accountRegionScope, propertyIgnorer } = properties;

  const scopedAws = simAws.accountRegionScope(
    accountRegionScope.accountId,
    accountRegionScope.regionName,
  );

  return new SimCfnDynamicReferences({
    propertyIgnorer,
    resolvers: new Map(
      simCfnDynamicReferenceResolvers
        .entries()
        .map(([service, resolver]) => [
          service,
          resolver({ simAws, scopedAws }),
        ]),
    ),
  });
}
