import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimLambdaEnvironmentConflicts } from "../../function/environment/sim-lambda-environment-conflicts.js";
import type { SimLambdaEnvironment } from "../../function/environment/sim-lambda-environment.js";
import { simLambdaUnqualifiedFunctionOf } from "../../function/sim-lambda-function-reference.js";
import type {
  SimLambdaFunction,
  SimLambdaFunctionMap,
} from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { UpdateFunctionConfigurationAuthorizer } from "./update-function-configuration-authorizer.js";
import { requireUpdateFunctionConfigurationInput } from "./update-function-configuration-input.js";
import type {
  SimUpdateFunctionConfigurationCommand,
  SimUpdateFunctionConfigurationCommandOutput,
} from "./update-function-configuration.command.js";

interface UpdateFunctionConfigurationCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly functionMap: SimLambdaFunctionMap;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly environmentConflicts?: SimLambdaEnvironmentConflicts;
}

interface UpdateFunctionConfigurationCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda UpdateFunctionConfigurationCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/UpdateFunctionConfigurationCommand/
 */
export class UpdateFunctionConfigurationCommandHandler implements CommandHandler<
  SimUpdateFunctionConfigurationCommand,
  SimUpdateFunctionConfigurationCommandOutput
> {
  private readonly functions: SimLambdaFunctionLookup;
  private readonly functionMap: SimLambdaFunctionMap;
  private readonly authorizer: UpdateFunctionConfigurationAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly environmentConflicts: SimLambdaEnvironmentConflicts;

  constructor(properties: UpdateFunctionConfigurationCommandHandlerProperties) {
    const {
      functions,
      functionMap,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      environmentConflicts = new SimLambdaEnvironmentConflicts(),
    } = properties;
    this.functions = functions;
    this.functionMap = functionMap;
    this.authorizer = new UpdateFunctionConfigurationAuthorizer({ iam });
    this.background = background;
    this.environmentConflicts = environmentConflicts;
  }

  /**
   * Change a sim Lambda function's settings.
   *
   * A member the request leaves out keeps the value the function has. The
   * function keeps its name, ARN, code, resource-based policy, Function URL,
   * published versions and aliases, and a version published beforehand keeps
   * the settings it was published with.
   */
  async handle(
    command: SimUpdateFunctionConfigurationCommand,
    options?: UpdateFunctionConfigurationCommandHandlerOptions,
  ): Promise<SimUpdateFunctionConfigurationCommandOutput> {
    const { name, update } = requireUpdateFunctionConfigurationInput(command);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const functionName = simLambdaUnqualifiedFunctionOf(name);
    this.authorizer.authorize(
      this.functions.functionArn(functionName),
      update.roleArn,
      options?.caller,
    );

    const simFunction = this.functions.require(functionName);
    simFunction.updateConfiguration(update);

    if (update.environmentVariables !== undefined) {
      this.environmentConflicts.check(
        simFunction.environment,
        this.otherEnvironments(simFunction),
      );
    }

    return { $metadata: {}, ...simFunction.configuration() };
  }

  /**
   * The environments of the other functions this simulated Lambda holds.
   *
   * The function being updated is left out, because a variable is only worth
   * reporting where two different values for one name are in play, and its
   * own new value is the one being checked.
   */
  private otherEnvironments(
    simFunction: SimLambdaFunction,
  ): Iterable<SimLambdaEnvironment> {
    return this.functionMap
      .values()
      .filter((existing) => existing !== simFunction)
      .map((existing) => existing.environment);
  }
}
