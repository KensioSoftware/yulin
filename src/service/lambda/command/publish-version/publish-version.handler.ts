import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simLambdaUnqualifiedFunctionOf } from "../../function/sim-lambda-function-reference.js";
import type { SimLambdaFunctionVersionStore } from "../../function/version/sim-lambda-function-version-store.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { VersionAuthorizer } from "../version/version-authorizer.js";
import type {
  SimPublishVersionCommand,
  SimPublishVersionCommandOutput,
} from "./publish-version.command.js";

interface PublishVersionCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly versions: SimLambdaFunctionVersionStore;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface PublishVersionCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda PublishVersionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/PublishVersionCommand/
 */
export class PublishVersionCommandHandler implements CommandHandler<
  SimPublishVersionCommand,
  SimPublishVersionCommandOutput
> {
  private readonly functions: SimLambdaFunctionLookup;
  private readonly versions: SimLambdaFunctionVersionStore;
  private readonly authorizer: VersionAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: PublishVersionCommandHandlerProperties) {
    const {
      functions,
      versions,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.functions = functions;
    this.versions = versions;
    this.authorizer = new VersionAuthorizer({
      iam,
      action: "lambda:PublishVersion",
    });
    this.background = background;
  }

  /**
   * Publish a sim Lambda function as it stands as its next version.
   *
   * The first version a function publishes is 1, and each later one counts up
   * from there.
   */
  async handle(
    command: SimPublishVersionCommand,
    options?: PublishVersionCommandHandlerOptions,
  ): Promise<SimPublishVersionCommandOutput> {
    assertDefined(
      command.input.FunctionName,
      "PublishVersionCommand.input.FunctionName required",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const functionName = simLambdaUnqualifiedFunctionOf(
      command.input.FunctionName,
    );
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      options?.caller,
    );

    // Real Lambda refuses to publish a function an update is still being
    // applied to, since the version would copy settings that are not settled.
    const simFunction = this.functions.require(functionName);
    simFunction.updates.assertIdle(simFunction.arn, command.input.RevisionId);

    const version = this.versions.publish(
      simFunction,
      command.input.Description,
    );

    return { $metadata: {}, ...version.configuration() };
  }
}
