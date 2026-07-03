import type { SimCfnExecutableResourceBinding } from "../sim-cfn-exec-binding.type.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";

const cdkPathMetadataKeys = ["aws:cdk:path", "aws:cdk:logicalId"];

/**
 * Validate that every executable binding targets a Resource in the Stack.
 */
export function validateSimCfnExecutableResourceBindings(props: {
  readonly stackName: string;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
  readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
}): void {
  const bindings = props.bindings ?? [];

  for (const binding of bindings) {
    if (bindingMatchesStackResource(binding, props.resources)) {
      continue;
    }

    throw new Error(
      `Invalid sim CloudFormation executable binding in Stack ${props.stackName}: ${describeBinding(binding)} does not resolve to a Resource in the Stack`,
    );
  }
}

function bindingMatchesStackResource(
  binding: SimCfnExecutableResourceBinding,
  resources: ReadonlyMap<string, SimCfnResource>,
): boolean {
  if ("logicalId" in binding) {
    return resources.has(binding.logicalId);
  }

  if ("functionName" in binding) {
    return [...resources.values()].some(
      (resource) => cloudFrontFunctionName(resource) === binding.functionName,
    );
  }

  if ("arn" in binding) {
    return [...resources.values()].some(
      (resource) => cloudFrontFunctionArn(resource) === binding.arn,
    );
  }

  if ("cdkPath" in binding) {
    return [...resources.values()].some(
      (resource) => cdkPath(resource) === binding.cdkPath,
    );
  }

  /* v8 ignore next -- compile-time exhaustive guard */
  return false;
}

function cloudFrontFunctionName(resource: SimCfnResource): string | undefined {
  if (resource.type !== "AWS::CloudFront::Function") {
    return undefined;
  }

  const name = resource.properties["Name"];

  return typeof name === "string" && name.length > 0
    ? name
    : resource.logicalId;
}

function cloudFrontFunctionArn(resource: SimCfnResource): string | undefined {
  const functionName = cloudFrontFunctionName(resource);

  /* v8 ignore if */
  if (functionName === undefined) {
    return undefined;
  }

  return `arn:aws:cloudfront::${resource.accountRegionScope.accountId}:function/${functionName}`;
}

function cdkPath(resource: SimCfnResource): string | undefined {
  const metadata = resource.template["Metadata"];

  if (
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return undefined;
  }

  for (const metadataKey of cdkPathMetadataKeys) {
    // eslint-disable-next-line security/detect-object-injection
    const value = metadata[metadataKey];

    if (typeof value === "string") {
      return value;
    }
  }

  /* v8 ignore next */
  return undefined;
}

function describeBinding(binding: SimCfnExecutableResourceBinding): string {
  if ("logicalId" in binding) {
    return `logicalId ${JSON.stringify(binding.logicalId)}`;
  }

  if ("functionName" in binding) {
    return `functionName ${JSON.stringify(binding.functionName)}`;
  }

  if ("arn" in binding) {
    return `arn ${JSON.stringify(binding.arn)}`;
  }

  if ("cdkPath" in binding) {
    return `cdkPath ${JSON.stringify(binding.cdkPath)}`;
  }

  /* v8 ignore next -- compile-time exhaustive guard */
  return "unknown binding target";
}
