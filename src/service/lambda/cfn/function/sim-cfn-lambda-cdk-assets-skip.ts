import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import type { SimCfnLambdaFunctionProperties } from "./sim-cfn-lambda-function-properties-parser.js";

/**
 * CDK bootstrap assets buckets are named cdk-{qualifier}-assets-{account}-{region}.
 */
const cdkBootstrapAssetsBucketPattern =
  /^cdk-[a-z0-9]+-assets-\d{12}-[a-z0-9-]+$/u;

/**
 * Skips functions whose code lives in a missing CDK bootstrap assets bucket.
 *
 * Deploying from a synthesized template file publishes the cloud assembly's
 * assets into that bucket in sim S3 first, so asset-bundled function code is
 * normally found there. This skip covers what is left: a CDK-shaped template
 * deployed without its cloud assembly, such as a template object passed
 * inline, where there is no asset to publish and nothing to fetch.
 *
 * The "Unsupported sim ... CloudFormation" wording marks the Resource as
 * skipped rather than failing the stack.
 */
export class SimCfnLambdaCdkAssetsSkip {
  /**
   * Map a creation failure to a skip error, when the failure was a code
   * fetch from a CDK bootstrap assets bucket that does not exist in sim S3.
   */
  findSkipError(
    resource: SimCfnResource,
    functionProperties: SimCfnLambdaFunctionProperties,
    error: unknown,
  ): Error | undefined {
    if (!this.isMissingCdkBootstrapAssetsBucket(functionProperties, error)) {
      return undefined;
    }

    const bucketName = functionProperties.code?.S3Bucket ?? "";

    return new Error(
      `Unsupported sim Lambda CloudFormation Resource ${resource.logicalId}: ` +
        `function code from missing CDK bootstrap assets bucket ${bucketName}. ` +
        `Deploy from a synthesized CDK template file so its cloud assembly ` +
        `assets can be published, or bind a real in-process handler to this ` +
        `function.`,
    );
  }

  private isMissingCdkBootstrapAssetsBucket(
    functionProperties: SimCfnLambdaFunctionProperties,
    error: unknown,
  ): boolean {
    const bucketName = functionProperties.code?.S3Bucket;

    return (
      bucketName !== undefined &&
      cdkBootstrapAssetsBucketPattern.test(bucketName) &&
      error instanceof SimLambdaInvalidParameterValueException &&
      error.message.includes("NoSuchBucket")
    );
  }
}
