import type { SimCfnResource } from "../../../resource/sim-cfn-resource.js";
import type { SimCdkOutContext } from "../../sim-cdk-out-context.js";

interface SimCdkBucketDeploymentAssetErrorMessageProps {
  readonly resource: SimCfnResource;
  readonly sourceObjectKey: string;
  readonly cdkOutContext: SimCdkOutContext | undefined;
  readonly reason: string;
}

/**
 * Formats CDK BucketDeployment asset resolution error messages.
 */
export class SimCdkBucketDeployErrorMessage {
  constructor(
    private readonly props: SimCdkBucketDeploymentAssetErrorMessageProps,
  ) {}

  /**
   * Build the complete asset resolution error message.
   */
  toString(): string {
    return [
      `Could not configure Custom::CDKBucketDeployment ${this.props.resource.logicalId}.`,
      "",
      "Referenced source object key:",
      this.props.sourceObjectKey,
      "",
      "Expected asset metadata in:",
      this.props.cdkOutContext?.assetsManifestPath ?? "unknown assets manifest",
      "",
      this.props.reason,
      "",
      "Run `cdk synth` and ensure the cloud assembly is available.",
    ].join("\n");
  }
}
