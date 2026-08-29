import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfFunctionAccess } from "./sim-cf-function-access.js";
import { simCffRequestedStage } from "../../cff/sim-cff-stage.js";
import type {
  SimGetFunctionCommand,
  SimGetFunctionCommandOutput,
} from "./sim-cf-function-command.types.js";

/**
 * Simulated CloudFront GetFunction command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/GetFunctionCommand/
 */
export class SimCfGetFunction {
  private static readonly action = "cloudfront:GetFunction";

  constructor(private readonly access: SimCfFunctionAccess) {}

  /**
   * Get one sim CloudFront Function's code.
   *
   * A Function created from source answers with the source it was given. One
   * created from a handler function reference has no uploaded source, and
   * answers with that handler's own source text. That is the code it runs.
   */
  async handle(
    command: SimGetFunctionCommand,
    options?: { readonly caller?: SimAwsCaller },
  ): Promise<SimGetFunctionCommandOutput> {
    assertDefined(command.input.Name, "GetFunctionCommand.input.Name");
    const stage = simCffRequestedStage(command.input.Stage);

    await this.access.background.sequence();

    const cloudFrontFunction = this.access.authorizedByName(
      SimCfGetFunction.action,
      command.input.Name,
      stage,
      options?.caller,
    );

    return {
      $metadata: {},
      FunctionCode: cloudFrontFunction.config.functionCode,
      ETag: cloudFrontFunction.config.etag,
      ContentType: "application/octet-stream",
    };
  }
}
