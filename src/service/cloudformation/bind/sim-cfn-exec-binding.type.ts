import type { CloudFrontFunction } from "../../cloudfront/index.js";

// Later this will be expanded for other executable resources such as Lambdas.
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type SimCfnExecutableResource = CloudFrontFunction.Handler | Function;

export type SimCfnExecutableResourceBinding<
  H extends SimCfnExecutableResource = SimCfnExecutableResource,
> =
  | {
      readonly logicalId: string;
      readonly functionName?: never;
      readonly arn?: never;
      readonly cdkPath?: never;
      readonly handler: H;
    }
  | {
      readonly functionName: string;
      readonly logicalId?: never;
      readonly arn?: never;
      readonly cdkPath?: never;
      readonly handler: H;
    }
  | {
      readonly arn: string;
      readonly logicalId?: never;
      readonly functionName?: never;
      readonly cdkPath?: never;
      readonly handler: H;
    }
  | {
      readonly cdkPath: string;
      readonly logicalId?: never;
      readonly functionName?: never;
      readonly arn?: never;
      readonly handler: H;
    };

export type SimCfnCfBinding =
  SimCfnExecutableResourceBinding<CloudFrontFunction.Handler>;
