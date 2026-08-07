import type {
  SimCfnExecutableResource,
  SimCfnExecutableResourceBinding,
} from "../sim-cfn-exec-binding.type.js";
import { cdkPathMetadataKeys } from "./sim-cfn-exec-binding-matcher.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";

interface SimCfnExecBindingFinderProperties {
  readonly resource: SimCfnResource;
  readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
}

/**
 * The resolved identifiers of the executable Resource a factory is creating,
 * used to decide which binding targets it.
 */
export interface SimCfnExecBindingTargets {
  readonly functionName: string;
  readonly arn?: string | undefined;
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
 */
export class SimCfnExecBindingFinder<
  H extends SimCfnExecutableResource = SimCfnExecutableResource,
> {
  private readonly resource: SimCfnResource;
  private readonly bindings:
    | readonly SimCfnExecutableResourceBinding[]
    | undefined;

  constructor(properties: SimCfnExecBindingFinderProperties) {
    this.resource = properties.resource;
    this.bindings = properties.bindings;
  }

  /**
   * Return the first binding that targets this executable Resource.
   *
   * Logical ID matching is evaluated before function-name matching because the
   * logical ID is stable even when the template omits the function name
   * property and the simulator falls back to the Resource logical ID as the
   * local name.
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
      return binding.cdkPath === this.cdkPath();
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
      this.cdkConstructIdFromPath() === logicalId
    );
  }

  /**
   * Extract the construct ID from a CDK metadata path.
   *
   * CDK paths for low-level resources often end with `/Resource`. In that case,
   * the construct ID is the previous path segment. If the path does not end with
   * `Resource`, the last path segment is the best available construct identifier.
   */
  private cdkConstructIdFromPath(): string | undefined {
    const path = this.cdkPath();

    if (path === undefined) {
      return undefined;
    }

    const parts = path.split("/").filter((part) => part.length > 0);
    const resourceIndex = parts.lastIndexOf("Resource");

    if (resourceIndex > 0) {
      return parts[resourceIndex - 1];
    }

    return parts.at(-1);
  }

  /**
   * Read a CDK path value from Resource Metadata.
   *
   * CDK has used more than one metadata key for construct paths over time. The
   * shared `cdkPathMetadataKeys` list captures those supported keys, and the first
   * string value found is treated as the path for this Resource.
   */
  private cdkPath(): string | undefined {
    const metadata = this.resource.template["Metadata"];

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

    return undefined;
  }
}
