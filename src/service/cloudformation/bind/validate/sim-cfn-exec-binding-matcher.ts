import { simLambdaFunctionArn } from "../../../lambda/function/sim-lambda-function-configuration.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import type { SimCfnExecutableResourceBinding } from "../sim-cfn-exec-binding.type.js";
import { SimCfnImageRepositoryTarget } from "./sim-cfn-image-repository-target.js";
import { SimCfnResourceCdkPath } from "./sim-cfn-resource-cdk-path.js";
import { SimCfnResourceImageUri } from "./sim-cfn-resource-image-uri.js";

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
   * - `imageRepository` checks the Lambda Code.ImageUri, ignoring its tag.
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
        (resource) =>
          new SimCfnResourceCdkPath(resource).path() === binding.cdkPath,
      );
    }

    if ("imageRepository" in binding) {
      return this.#matchesImageRepository(binding.imageRepository);
    }

    /* v8 ignore next -- compile-time exhaustive guard */
    return false;
  }

  /**
   * Whether any function in the Stack runs an image from this repository.
   */
  #matchesImageRepository(imageRepository: string): boolean {
    const target = new SimCfnImageRepositoryTarget(imageRepository);

    return this.#resources.some((resource) =>
      target.matchesImageUri(new SimCfnResourceImageUri(resource).value()),
    );
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
      new SimCfnResourceCdkPath(resource).constructId() === logicalId
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
}
