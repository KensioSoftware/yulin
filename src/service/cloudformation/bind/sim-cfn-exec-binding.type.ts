import type { ExactlyOne } from "../../../util/exactly-one.type.js";
import type { CloudFrontFunction } from "../../cloudfront/index.js";
import type { SimLambdaHandler } from "../../lambda/function/sim-lambda-handler.type.js";

/**
 * A real in-process handler function that can back an executable
 * CloudFormation Resource, which is a CloudFront Function handler or a Lambda
 * handler. The plain Function member keeps room for other executable resource
 * kinds.
 */
export type SimCfnExecutableResource =
  | CloudFrontFunction.Handler
  | SimLambdaHandler
  // oxlint-disable-next-line typescript/no-unsafe-function-type
  | Function;

/**
 * The ways a binding can name the executable Resource it backs.
 *
 * A binding gives one of these. The rest are refused, because a Resource named
 * two ways may be two Resources.
 */
export interface SimCfnExecutableTargets {
  /** The name the template gives the Resource. */
  readonly logicalId: string;

  /** The function name the Resource's properties declare. */
  readonly functionName: string;

  /** The function ARN the Resource's properties declare. */
  readonly arn: string;

  /** The CDK construct path a synthesized logical ID was generated from. */
  readonly cdkPath: string;

  /**
   * A container image repository, matching any AWS::Lambda::Function whose
   * `Code.ImageUri` names it. The image tag is ignored, and one binding covers
   * every stack that runs that image.
   */
  readonly imageRepository: string;
}

/**
 * A real in-process handler bound at deploy time to one executable Resource of
 * a Stack, and which Resource it backs.
 *
 * ```typescript
 * await simAws.cloudFormation().deployTemplateFile({
 *   stackName: "orders",
 *   templatePath: "cdk.out/OrdersStack.template.json",
 *   bindings: [{ logicalId: "OrdersFunction", handler: ordersHandler }],
 * });
 * ```
 */
export type SimCfnExecutableResourceBinding<
  H extends SimCfnExecutableResource = SimCfnExecutableResource,
> = ExactlyOne<SimCfnExecutableTargets> & {
  readonly handler: H;
};

export type SimCfnCfBinding =
  SimCfnExecutableResourceBinding<CloudFrontFunction.Handler>;

export type SimCfnLambdaBinding =
  SimCfnExecutableResourceBinding<SimLambdaHandler>;
