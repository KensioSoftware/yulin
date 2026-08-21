import {
  type SimCfnBinding,
  simCfnIsExecutableBinding,
} from "../sim-cfn-binding.js";
import type {
  SimCfnExecutableResource,
  SimCfnExecutableResourceBinding,
} from "../sim-cfn-exec-binding.type.js";
import { SimCfnImageRepositoryTarget } from "./sim-cfn-image-repository-target.js";
import { SimCfnResourceCdkPath } from "./sim-cfn-resource-cdk-path.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";

interface SimCfnExecBindingFinderProperties {
  readonly resource: SimCfnResource;
  readonly bindings?: readonly SimCfnBinding[] | undefined;
}

/**
 * The resolved identifiers of the executable Resource a factory is creating,
 * used to decide which binding targets it.
 */
export interface SimCfnExecBindingTargets {
  readonly functionName: string;
  readonly arn?: string | undefined;
  readonly imageUri?: string | undefined;
}

/**
 * Finds the executable binding that should replace CloudFormation function
 * code.
 *
 * An executable resource such as a CloudFront Function or Lambda function can
 * be declared in a synthesized CloudFormation template, while test code may
 * provide a real in-process handler through a binding. This class keeps the
 * matching rules in one place so resource factories can stay focused on
 * validating Resource properties and building command input.
 *
 * Supported binding targets:
 *
 * - CloudFormation logical ID, for templates written directly or synthesized by CDK
 * - CDK construct ID, recovered from Resource Metadata path values
 * - resolved function name, for name-based bindings
 * - resource ARN, when the creating factory supplies its ARN format
 * - CDK construct path, matched against Resource Metadata
 * - container image repository, when the creating factory supplies the image
 *   URI the Resource resolved to
 */
export class SimCfnExecBindingFinder<
  H extends SimCfnExecutableResource = SimCfnExecutableResource,
> {
  private readonly resource: SimCfnResource;
  private readonly cdkPath: SimCfnResourceCdkPath;
  private readonly bindings:
    | readonly SimCfnExecutableResourceBinding[]
    | undefined;

  constructor(properties: SimCfnExecBindingFinderProperties) {
    this.resource = properties.resource;
    this.cdkPath = new SimCfnResourceCdkPath(properties.resource);
    // A deployment's bindings are one list holding both kinds, and a container
    // binding can name a logical ID as an executable one can. Dropping them
    // here is what stops a container binding backing a function that happens
    // to share the task definition's logical ID.
    this.bindings = properties.bindings?.filter((binding) =>
      simCfnIsExecutableBinding(binding),
    );
  }

  /**
   * Return the first binding that targets this executable Resource.
   *
   * Bindings are considered in the order they were given, so where two of them
   * could match the same Resource, the earlier one is the one that backs it.
   * That matters for a container image binding covering a whole repository
   * alongside a logical ID binding naming one function: whichever is listed
   * first wins.
   */
  findBinding(
    targets: SimCfnExecBindingTargets,
  ): SimCfnExecutableResourceBinding<H> | undefined {
    return this.bindings?.find((binding) =>
      this.matchesBinding(binding, targets),
    ) as SimCfnExecutableResourceBinding<H> | undefined;
  }

  /**
   * Decide whether a binding targets this Resource.
   *
   * The union uses distinct target fields, so checking property presence is enough
   * to choose the matching strategy. The final false branch protects future binding
   * shapes from being treated as matches before explicit support is added.
   */
  private matchesBinding(
    binding: SimCfnExecutableResourceBinding,
    targets: SimCfnExecBindingTargets,
  ): boolean {
    if ("logicalId" in binding) {
      return this.resourceMatchesLogicalIdBinding(binding.logicalId);
    }

    if ("functionName" in binding) {
      return binding.functionName === targets.functionName;
    }

    if ("arn" in binding) {
      return targets.arn !== undefined && binding.arn === targets.arn;
    }

    if ("cdkPath" in binding) {
      return binding.cdkPath === this.cdkPath.path();
    }

    if ("imageRepository" in binding) {
      return new SimCfnImageRepositoryTarget(
        binding.imageRepository,
      ).matchesImageUri(targets.imageUri);
    }

    /* v8 ignore next */
    return false;
  }

  /**
   * Match either the synthesized Resource logical ID or the original CDK construct
   * ID extracted from metadata.
   *
   * CDK commonly synthesizes logical IDs with hashes. The metadata path preserves
   * the construct path, which lets tests bind to the readable construct ID instead
   * of the generated logical ID.
   */
  private resourceMatchesLogicalIdBinding(logicalId: string): boolean {
    return (
      this.resource.logicalId === logicalId ||
      this.cdkPath.constructId() === logicalId
    );
  }
}
