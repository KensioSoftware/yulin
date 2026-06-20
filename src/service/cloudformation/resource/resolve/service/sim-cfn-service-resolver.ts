import type { SimAws } from "../../../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../../../aws/sim-aws-account-region-scope.js";
import type {
  SimCloudFormationParsedResourceType,
  SimCfnServiceResourceFactory,
} from "../../factory/sim-cfn-resource-factory.type.js";
import { SimCfnCfnResourceFactory } from "../../factory/sim-cfn-cfn-resource-factory.js";

/**
 * Resolve a scoped simulated service CloudFormation Resource factory.
 */
export function resolveSimCloudFormationServiceResourceFactory(
  simAws: SimAws,
  accountRegionScope: SimAwsAccountRegionScope,
  resourceType: SimCloudFormationParsedResourceType,
): SimCfnServiceResourceFactory {
  if (resourceType.providerName !== "AWS") {
    throw new Error(
      `Unsupported sim CloudFormation Resource provider ${resourceType.providerName}`,
    );
  }

  const scopedAws = simAws.accountRegionScope(
    accountRegionScope.accountId,
    accountRegionScope.regionName,
  );

  switch (resourceType.serviceName) {
    case "CloudFormation": {
      return new SimCfnCfnResourceFactory();
    }
    case "S3": {
      return scopedAws.s3().cfnResourceFactory();
    }
    default: {
      throw new Error(
        `Unsupported sim CloudFormation Resource service ${resourceType.serviceName}`,
      );
    }
  }
}
