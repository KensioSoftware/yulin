import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimCloudFrontFunctionName } from "../../cff/sim-cloudfront-function.js";
import { SimCloudFrontNoSuchFunctionExists } from "../../error/sim-cloudfront.error.js";
import type { SimCloudFrontFunctionMap } from "../create-function/create-function.handler.js";
import { DeleteFunctionAuthorizer } from "./delete-function-authorizer.js";
import type {
  SimDeleteFunctionCommand,
  SimDeleteFunctionCommandOutput,
} from "./delete-function.command.js";

interface DeleteFunctionCommandHandlerProperties {
  readonly accountId: SimAwsAccountId;
  readonly cloudFrontFunctions: SimCloudFrontFunctionMap;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface DeleteFunctionCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * CloudFront DeleteFunctionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/DeleteFunctionCommand/
 */
export class DeleteFunctionCommandHandler implements CommandHandler<
  SimDeleteFunctionCommand,
  SimDeleteFunctionCommandOutput
> {
  private readonly cloudFrontFunctions: SimCloudFrontFunctionMap;
  private readonly authorizer: DeleteFunctionAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteFunctionCommandHandlerProperties) {
    const {
      accountId,
      cloudFrontFunctions,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.cloudFrontFunctions = cloudFrontFunctions;
    this.authorizer = new DeleteFunctionAuthorizer({ accountId, iam });
    this.background = background;
  }

  /**
   * Handle deleting a CloudFront Function.
   *
   * Real CloudFront refuses with FunctionInUse while the Function is
   * associated with a Distribution, and only deletes an unassociated one. This
   * simulation does not track association: a cache Behavior holds the Function
   * ARN it runs, and nothing tells the Function it has been taken up, so every
   * Function here is deletable. A Behavior still pointing at a deleted
   * Function finds nothing and runs no Function code.
   *
   * The `IfMatch` ETag is accepted and not checked, for the same reason as
   * DeleteDistribution: nothing else here versions a resource.
   */
  async handle(
    command: SimDeleteFunctionCommand,
    options?: DeleteFunctionCommandHandlerOptions,
  ): Promise<SimDeleteFunctionCommandOutput> {
    assertDefined(command.input.Name, "DeleteFunctionCommand.input.Name");
    const functionName = command.input.Name as SimCloudFrontFunctionName;

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(functionName, options?.caller);

    if (!this.cloudFrontFunctions.delete(functionName)) {
      throw new SimCloudFrontNoSuchFunctionExists(
        `No sim CloudFront Function named ${functionName}`,
      );
    }

    return { $metadata: { httpStatusCode: 204 } };
  }
}
