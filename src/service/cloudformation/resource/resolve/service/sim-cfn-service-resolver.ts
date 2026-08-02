import type { SimAws } from "../../../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../../../aws/sim-aws-account-region-scope.js";
import type {
  SimCloudFormationParsedResourceType,
  SimCfnServiceResourceFactory,
} from "../../factory/sim-cfn-resource-factory.type.js";
import { SimCdkBucketDeploymentResourceFactory } from "../../../cdk/s3/bucket-deployment/sim-cdk-bucket-deployment.js";
import { simCfnServiceResourceFactories } from "./sim-cfn-service-factories.js";

/**
 * Resolve a scoped simulated service CloudFormation Resource factory.
 */
export function resolveSimCloudFormationServiceResourceFactory(
  simAws: SimAws,
  accountRegionScope: SimAwsAccountRegionScope,
  resourceType: SimCloudFormationParsedResourceType,
): SimCfnServiceResourceFactory {
  if (
    resourceType.providerName === "Custom" &&
    resourceType.serviceName === "Custom" &&
    resourceType.resourceTypeName === "CDKBucketDeployment"
  ) {
    return new SimCdkBucketDeploymentResourceFactory();
  }

  if (resourceType.providerName === "Custom") {
    throw new Error(
      `Unsupported sim CloudFormation Custom Resource ${resourceType.resourceTypeName}`,
    );
  }

  if (resourceType.providerName !== "AWS") {
    throw new Error(
      `Unsupported sim CloudFormation Resource provider ${resourceType.providerName}`,
    );
  }

  const serviceFactory = simCfnServiceResourceFactories.get(
    resourceType.serviceName,
  );

  if (serviceFactory === undefined) {
    throw new Error(
      `Unsupported sim CloudFormation Resource service ${resourceType.serviceName}`,
    );
  }

  return serviceFactory(
    simAws.accountRegionScope(
      accountRegionScope.accountId,
      accountRegionScope.regionName,
    ),
  );
}
