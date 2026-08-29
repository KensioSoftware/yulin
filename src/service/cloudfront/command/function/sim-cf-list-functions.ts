import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfFunctionAccess } from "./sim-cf-function-access.js";
import {
  simCffInStage,
  simCffRequestedStage,
} from "../../cff/sim-cff-stage.js";
import { simCfFunctionSummary } from "./sim-cf-function-summary.js";
import type {
  SimListFunctionsCommand,
  SimListFunctionsCommandOutput,
} from "./sim-cf-function-command.types.js";

/**
 * Simulated CloudFront ListFunctions command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/ListFunctionsCommand/
 */
export class SimCfListFunctions {
  private static readonly action = "cloudfront:ListFunctions";

  constructor(private readonly access: SimCfFunctionAccess) {}

  /**
   * List this Account's sim CloudFront Functions in one stage.
   *
   * The whole list comes back. `Marker` and `MaxItems` are the paging every
   * other simulated listing leaves out, so there is no `NextMarker` either.
   */
  async handle(
    command: SimListFunctionsCommand,
    options?: { readonly caller?: SimAwsCaller },
  ): Promise<SimListFunctionsCommandOutput> {
    const stage = simCffRequestedStage(command.input.Stage);

    await this.access.background.sequence();

    // Listing is authorized across the Account rather than per Function, which
    // is what a policy for this action grants.
    this.access.authorizeAnyFunction(
      SimCfListFunctions.action,
      options?.caller,
    );

    const cloudFrontFunctions = this.access.cloudFrontFunctions
      .values()
      .filter((cloudFrontFunction) => simCffInStage(cloudFrontFunction, stage))
      .toArray();

    return {
      $metadata: {},
      FunctionList: {
        Quantity: cloudFrontFunctions.length,
        Items: cloudFrontFunctions.map((cloudFrontFunction) =>
          simCfFunctionSummary(cloudFrontFunction, stage),
        ),
      },
    };
  }
}
