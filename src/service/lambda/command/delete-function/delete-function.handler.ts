import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import {
  type SimLambdaFunctionMap,
  type SimLambdaFunctionName,
  simLambdaFunctionArn,
} from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionUrlStore } from "../../function/url/sim-lambda-function-url-store.js";
import { DeleteFunctionAuthorizer } from "./delete-function-authorizer.js";
import type {
  SimDeleteFunctionCommand,
  SimDeleteFunctionCommandOutput,
} from "./delete-function.command.js";

interface DeleteFunctionCommandHandlerProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly functions: SimLambdaFunctionMap;
  readonly functionUrls: SimLambdaFunctionUrlStore;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface DeleteFunctionCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda DeleteFunctionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/DeleteFunctionCommand/
 */
export class DeleteFunctionCommandHandler implements CommandHandler<
  SimDeleteFunctionCommand,
  SimDeleteFunctionCommandOutput
> {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly functions: SimLambdaFunctionMap;
  private readonly functionUrls: SimLambdaFunctionUrlStore;
  private readonly authorizer: DeleteFunctionAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteFunctionCommandHandlerProperties) {
    const {
      accountRegionScope,
      functions,
      functionUrls,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.accountRegionScope = accountRegionScope;
    this.functions = functions;
    this.functionUrls = functionUrls;
    this.authorizer = new DeleteFunctionAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Delete a function, and the Function URL that belongs to it.
   *
   * A function's URL is part of the function on real Lambda, so it goes with
   * it. Event source mappings are not: real Lambda leaves a mapping in place
   * pointing at a function that is gone, and simulated polling treats a missing
   * function as nothing to deliver to.
   *
   * The resource policy the Add Permission command builds is held on the
   * function itself, so it goes at the same time.
   */
  async handle(
    command: SimDeleteFunctionCommand,
    options?: DeleteFunctionCommandHandlerOptions,
  ): Promise<SimDeleteFunctionCommandOutput> {
    assertDefined(
      command.input.FunctionName,
      "DeleteFunctionCommand.input.FunctionName required",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const functionName = command.input.FunctionName as SimLambdaFunctionName;
    const functionArn = simLambdaFunctionArn(
      this.accountRegionScope,
      functionName,
    );
    this.authorizer.authorize(functionArn, options?.caller);

    const simFunction = this.functions.get(functionName);

    if (simFunction === undefined) {
      throw new SimLambdaResourceNotFoundException(
        `Function not found: ${functionArn}`,
      );
    }

    this.functionUrls.deleteIfPresent(simFunction);
    this.functions.delete(functionName);

    return { $metadata: {} };
  }
}
