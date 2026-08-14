import type { CloudFrontFunction } from "../../cloudfront/index.js";
import type { SimLambdaHandler } from "../../lambda/function/sim-lambda-handler.type.js";

/**
 * A real in-process handler function that can back an executable
 * CloudFormation Resource: a CloudFront Function handler or a Lambda handler.
 * The plain Function member keeps room for other executable resource kinds.
 */
export type SimCfnExecutableResource =
  | CloudFrontFunction.Handler
  | SimLambdaHandler
  // oxlint-disable-next-line typescript/no-unsafe-function-type
  | Function;

export type SimCfnExecutableResourceBinding<
  H extends SimCfnExecutableResource = SimCfnExecutableResource,
> =
  | {
      readonly logicalId: string;
      readonly functionName?: never;
      readonly arn?: never;
      readonly cdkPath?: never;
      readonly imageRepository?: never;
      readonly handler: H;
    }
  | {
      readonly functionName: string;
      readonly logicalId?: never;
      readonly arn?: never;
      readonly cdkPath?: never;
      readonly imageRepository?: never;
      readonly handler: H;
    }
  | {
      readonly arn: string;
      readonly logicalId?: never;
      readonly functionName?: never;
      readonly cdkPath?: never;
      readonly imageRepository?: never;
      readonly handler: H;
    }
  | {
      readonly cdkPath: string;
      readonly logicalId?: never;
      readonly functionName?: never;
      readonly arn?: never;
      readonly imageRepository?: never;
      readonly handler: H;
    }
  /**
   * A container image repository, matching any AWS::Lambda::Function whose
   * `Code.ImageUri` names it. The image tag is ignored, so one binding covers
   * every stack that runs that image.
   */
  | {
      readonly imageRepository: string;
      readonly logicalId?: never;
      readonly functionName?: never;
      readonly arn?: never;
      readonly cdkPath?: never;
      readonly handler: H;
    };

export type SimCfnCfBinding =
  SimCfnExecutableResourceBinding<CloudFrontFunction.Handler>;

export type SimCfnLambdaBinding =
  SimCfnExecutableResourceBinding<SimLambdaHandler>;
