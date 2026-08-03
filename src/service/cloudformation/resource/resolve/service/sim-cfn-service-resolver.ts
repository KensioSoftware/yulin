import type { SimAws } from "../../../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../../../aws/sim-aws-account-region-scope.js";
import type {
  SimCloudFormationParsedResourceType,
  SimCfnServiceResourceFactory,
} from "../../factory/sim-cfn-resource-factory.type.js";
import { simCdkCustomResourceFactories } from "./sim-cfn-custom-resource-factories.js";
import { simCfnServiceResourceFactories } from "./sim-cfn-service-factories.js";

/**
 * Resolve a scoped simulated service CloudFormation Resource factory.
 */
export function resolveSimCloudFormationServiceResourceFactory(
  simAws: SimAws,
  accountRegionScope: SimAwsAccountRegionScope,
  resourceType: SimCloudFormationParsedResourceType,
): SimCfnServiceResourceFactory {
  if (resourceType.providerName === "Custom") {
    return resolveSimCdkCustomResourceFactory(resourceType);
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

/**
 * Resolve the factory for a CDK custom Resource type.
 *
 * A custom Resource type is two parts, `Custom::<name>`, which the parser reads
 * as a service name of `Custom`. Anything carrying a service name of its own is
 * a type this simulator has not been told about, whatever it ends with.
 */
function resolveSimCdkCustomResourceFactory(
  resourceType: SimCloudFormationParsedResourceType,
): SimCfnServiceResourceFactory {
  if (resourceType.serviceName === "Custom") {
    const customResourceFactory = simCdkCustomResourceFactories.get(
      resourceType.resourceTypeName,
    );

    if (customResourceFactory !== undefined) {
      return customResourceFactory();
    }
  }

  throw new Error(
    `Unsupported sim CloudFormation Custom Resource ${resourceType.resourceTypeName}`,
  );
}
