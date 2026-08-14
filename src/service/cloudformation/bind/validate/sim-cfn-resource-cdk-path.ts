import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";

/**
 * CDK metadata keys holding a construct path.
 *
 * CDK templates commonly store construct path information under `aws:cdk:path`.
 * Some synthesized templates also expose `aws:cdk:logicalId`. Both values can
 * help map a user-facing executable binding back to the synthesized Resource.
 */
const cdkPathMetadataKeys = ["aws:cdk:path", "aws:cdk:logicalId"];

/**
 * The CDK construct path a synthesized Resource carries in its Metadata.
 *
 * Both the binding validator and the binding finder ask the same two questions
 * of a Resource, so the reading lives here rather than in either of them.
 */
export class SimCfnResourceCdkPath {
  private readonly resource: SimCfnResource;

  constructor(resource: SimCfnResource) {
    this.resource = resource;
  }

  /**
   * The CDK path value from Resource Metadata.
   *
   * CDK has used more than one metadata key for construct paths over time, and
   * the first string value found is treated as the path for this Resource.
   */
  path(): string | undefined {
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

  /**
   * The construct ID from the CDK path.
   *
   * L2 CDK constructs often synthesize a child named `Resource`, for example
   * `Stack/RedirectFunction/Resource`. In that case the meaningful construct ID
   * is the path segment before `Resource`, not the generated child segment.
   * Otherwise the last path segment is the best available construct identifier.
   */
  constructId(): string | undefined {
    const path = this.path();

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
}
