import type { CommandHandler } from "../../../../command/command-handler.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaFunctionMap } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionVersionStore } from "../../function/version/sim-lambda-function-version-store.js";
import { GetFunctionCommandHandler } from "../get-function/get-function.handler.js";
import type {
  SimGetFunctionConfigurationCommand,
  SimGetFunctionConfigurationCommandOutput,
} from "./get-function-configuration.command.js";

interface GetFunctionConfigurationCommandHandlerProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly functions: SimLambdaFunctionMap;
  readonly versions: SimLambdaFunctionVersionStore;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface GetFunctionConfigurationCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda GetFunctionConfigurationCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetFunctionConfigurationCommand/
 *
 * The read is GetFunction's under its own IAM action, answering with the
 * version's configuration alone. The tags GetFunction adds belong to a
 * different permission, so they are left out here as real Lambda leaves them
 * out.
 */
export class GetFunctionConfigurationCommandHandler implements CommandHandler<
  SimGetFunctionConfigurationCommand,
  SimGetFunctionConfigurationCommandOutput
> {
  private readonly read: GetFunctionCommandHandler;

  constructor(properties: GetFunctionConfigurationCommandHandlerProperties) {
    this.read = new GetFunctionCommandHandler({
      ...properties,
      action: "lambda:GetFunctionConfiguration",
    });
  }

  /**
   * Get the configuration of a sim Lambda function, or of the version a
   * qualifier names.
   */
  async handle(
    command: SimGetFunctionConfigurationCommand,
    options?: GetFunctionConfigurationCommandHandlerOptions,
  ): Promise<SimGetFunctionConfigurationCommandOutput> {
    const { version } = await this.read.resolve(
      command,
      options,
      "GetFunctionConfigurationCommand",
    );

    return { $metadata: {}, ...version.configuration() };
  }
}
