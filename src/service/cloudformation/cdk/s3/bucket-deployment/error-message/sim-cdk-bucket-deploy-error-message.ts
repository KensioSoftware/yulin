import type { SimCfnResource } from "../../../../resource/sim-cfn-resource.js";
import type { SimCdkOutContext } from "../../../sim-cdk-out-context.js";

interface SimCdkBucketDeploymentAssetErrorMessageProperties {
  readonly resource: SimCfnResource;
  readonly sourceObjectKey: string;
  readonly cdkOutContext: SimCdkOutContext | undefined;
  readonly reason: string;
}

/**
 * Formats CDK BucketDeployment asset resolution error messages.
 */
export class SimCdkBucketDeployErrorMessage {
  private readonly resource: SimCfnResource;
  private readonly sourceObjectKey: string;
  private readonly cdkOutContext: SimCdkOutContext | undefined;
  private readonly reason: string;

  constructor(properties: SimCdkBucketDeploymentAssetErrorMessageProperties) {
    this.resource = properties.resource;
    this.sourceObjectKey = properties.sourceObjectKey;
    this.cdkOutContext = properties.cdkOutContext;
    this.reason = properties.reason;
  }

  /**
   * Build the complete asset resolution error message.
   */
  toString(): string {
    return [
      `Could not configure Custom::CDKBucketDeployment ${this.resource.logicalId}.`,
      "",
      "Referenced source object key:",
      this.sourceObjectKey,
      "",
      "Expected asset metadata in:",
      this.cdkOutContext?.assetsManifestPath ?? "unknown assets manifest",
      "",
      this.reason,
      "",
      "Run `cdk synth` and ensure the cloud assembly is available.",
    ].join("\n");
  }
}
