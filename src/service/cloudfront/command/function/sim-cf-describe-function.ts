import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfFunctionAccess } from "./sim-cf-function-access.js";
import { simCffRequestedStage } from "../../cff/sim-cff-stage.js";
import { simCfFunctionSummary } from "./sim-cf-function-summary.js";
import type {
  SimDescribeFunctionCommand,
  SimDescribeFunctionCommandOutput,
} from "./sim-cf-function-command.types.js";

/**
 * Simulated CloudFront DescribeFunction command.
 *
 * This is the Function's configuration without its code. GetFunction is the
 * one that answers with the code.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/DescribeFunctionCommand/
 */
export class SimCfDescribeFunction {
  private static readonly action = "cloudfront:DescribeFunction";

  constructor(private readonly access: SimCfFunctionAccess) {}

  /**
   * Describe one sim CloudFront Function.
   */
  async handle(
    command: SimDescribeFunctionCommand,
    options?: { readonly caller?: SimAwsCaller },
  ): Promise<SimDescribeFunctionCommandOutput> {
    assertDefined(command.input.Name, "DescribeFunctionCommand.input.Name");
    const stage = simCffRequestedStage(command.input.Stage);

    await this.access.background.sequence();

    const cloudFrontFunction = this.access.authorizedByName(
      SimCfDescribeFunction.action,
      command.input.Name,
      stage,
      options?.caller,
    );

    return {
      $metadata: {},
      FunctionSummary: simCfFunctionSummary(cloudFrontFunction, stage),
      ETag: cloudFrontFunction.config.etag,
    };
  }
}
