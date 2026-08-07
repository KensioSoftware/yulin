import { simLambdaFunctionArn } from "../../../lambda/function/sim-lambda-function.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import type { SimCfnExecutableResourceBinding } from "../sim-cfn-exec-binding.type.js";

/**
 * CDK metadata paths for identifying resources corresponding to bindings.
 *
 * CDK templates commonly store construct path information under `aws:cdk:path`.
 * Some synthesized templates also expose `aws:cdk:logicalId`. Both values can
 * help map a user-facing executable binding back to the synthesized Resource.
 */
export const cdkPathMetadataKeys = ["aws:cdk:path", "aws:cdk:logicalId"];

/**
 * Matches executable-resource bindings against synthesized CloudFormation
 * Resources.
 *
 * This class keeps the matching rules separate from validation flow. The
 * validator only needs to decide whether every binding resolves; this matcher
 * explains what "resolves" means for each supported binding shape.
 */
export class SimCfnExecutableResourceBindingMatcher {
  readonly #resources: readonly SimCfnResource[];

  constructor(resources: ReadonlyMap<string, SimCfnResource>) {
    /*
     * Convert the map values once so each matching branch can scan a stable
     * resource list without repeating `[...resources.values()]`.
     */
    this.#resources = resources.values().toArray();
  }

  /**
   * Return true when the binding points at a Resource in the Stack.
   *
   * Each binding variant uses the most natural identifier available:
   *
   * - `logicalId` checks the synthesized logical ID and the CDK construct ID.
   * - `functionName` checks the CloudFront Function Name or Lambda
   *   FunctionName property, falling back to the logical ID because both can
   *   omit an explicit name.
   * - `arn` reconstructs the simulator's CloudFront Function or Lambda
   *   function ARN format.
   * - `cdkPath` checks CDK metadata emitted into the synthesized template.
   */
  matches(binding: SimCfnExecutableResourceBinding): boolean {
    if ("logicalId" in binding) {
      return this.#resources.some((resource) =>
        this.#resourceMatchesLogicalIdBinding(resource, binding.logicalId),
      );
    }

    if ("functionName" in binding) {
      return this.#resources.some(
        (resource) =>
          this.#executableFunctionName(resource) === binding.functionName,
      );
    }

    if ("arn" in binding) {
      return this.#resources.some(
        (resource) => this.#executableFunctionArn(resource) === binding.arn,
      );
    }

    if ("cdkPath" in binding) {
      return this.#resources.some(
        (resource) => this.#cdkPath(resource) === binding.cdkPath,
      );
    }

    /* v8 ignore next -- compile-time exhaustive guard */
    return false;
  }

  #resourceMatchesLogicalIdBinding(
    resource: SimCfnResource,
    logicalId: string | undefined,
  ): boolean {
    /*
     * CDK-generated logical IDs are not always pleasant to author by hand.
     * Accepting the construct ID from the CDK path lets binding config refer to
     * the original construct name while still validating against the synthesized
     * template.
     */
    return (
      resource.logicalId === logicalId ||
      this.#cdkConstructIdFromPath(resource) === logicalId
    );
  }

  /**
   * The name an executable function Resource resolves to when created.
   *
   * CloudFront Function Name and Lambda FunctionName are optional in CDK
   * output. When no explicit name is present, the simulator identifies the
   * function using its logical ID, matching the fallback used when the sim
   * resource is created.
   */
  #executableFunctionName(resource: SimCfnResource): string | undefined {
    const name = this.#functionNameProperty(resource);

    if (name === undefined) {
      return undefined;
    }

    return name.length > 0 ? name : resource.logicalId;
  }

  #functionNameProperty(resource: SimCfnResource): string | undefined {
    const propertyName = this.#namePropertyForType(resource.type);
    if (propertyName === undefined) {
      return undefined;
    }

    // oxlint-disable-next-line security/detect-object-injection -- fixed per-type property names.
    const name = resource.properties[propertyName];
    return typeof name === "string" ? name : "";
  }

  #namePropertyForType(resourceType: string | undefined): string | undefined {
    if (resourceType === "AWS::CloudFront::Function") {
      return "Name";
    }
    if (resourceType === "AWS::Lambda::Function") {
      return "FunctionName";
    }
    return undefined;
  }

  #executableFunctionArn(resource: SimCfnResource): string | undefined {
    const functionName = this.#executableFunctionName(resource);

    if (functionName === undefined) {
      return undefined;
    }

    /*
     * CloudFront Function ARNs do not contain a region component, while
     * Lambda function ARNs do. The account comes from the resource scope so
     * bindings can validate exact ARNs when associations use ARN-based
     * references.
     */
    if (resource.type === "AWS::Lambda::Function") {
      return simLambdaFunctionArn(resource.accountRegionScope, functionName);
    }
    return `arn:aws:cloudfront::${resource.accountRegionScope.accountId}:function/${functionName}`;
  }

  #cdkPath(resource: SimCfnResource): string | undefined {
    const metadata = resource.template["Metadata"];

    if (
      metadata === null ||
      typeof metadata !== "object" ||
      Array.isArray(metadata)
    ) {
      return undefined;
    }

    for (const metadataKey of cdkPathMetadataKeys) {
      // oxlint-disable-next-line security/detect-object-injection
      const value = metadata[metadataKey];

      if (typeof value === "string") {
        return value;
      }
    }

    /* v8 ignore next */
    return undefined;
  }

  #cdkConstructIdFromPath(resource: SimCfnResource): string | undefined {
    const path = this.#cdkPath(resource);

    if (path === undefined) {
      return undefined;
    }

    const parts = path.split("/").filter((part) => part.length > 0);
    const resourceIndex = parts.lastIndexOf("Resource");

    /*
     * L2 CDK constructs often synthesize a child named `Resource`, for example:
     * `Stack/RedirectFunction/Resource`. In that case the meaningful construct
     * ID is the path segment before `Resource`, not the generated child
     * segment.
     */
    if (resourceIndex > 0) {
      return parts[resourceIndex - 1];
    }

    return parts.at(-1);
  }
}
