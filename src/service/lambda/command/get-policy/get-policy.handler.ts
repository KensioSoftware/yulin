import type { CommandHandler } from "../../../../command/command-handler.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { FunctionUrlAuthorizer } from "../function-url/function-url-authorizer.js";
import type {
  SimGetPolicyCommand,
  SimGetPolicyCommandOutput,
} from "./get-policy.command.js";

interface GetPolicyCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

interface GetPolicyCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated Lambda GetPolicyCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetPolicyCommand/
 */
export class GetPolicyCommandHandler implements CommandHandler<
  SimGetPolicyCommand,
  SimGetPolicyCommandOutput
> {
  private readonly functions: SimLambdaFunctionLookup;
  private readonly authorizer: FunctionUrlAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetPolicyCommandHandlerProperties) {
    this.functions = properties.functions;
    this.authorizer = new FunctionUrlAuthorizer({
      iam: properties.iam,
      action: "lambda:GetPolicy",
    });
    this.background = properties.background;
  }

  /**
   * Read a sim Lambda function's resource policy.
   *
   * A function that has been granted nothing has no policy at all, which real
   * Lambda reports as the policy not being found rather than as an empty
   * document.
   */
  async handle(
    command: SimGetPolicyCommand,
    options?: GetPolicyCommandHandlerOptions,
  ): Promise<SimGetPolicyCommandOutput> {
    assertDefined(
      command.input.FunctionName,
      "GetPolicyCommand.input.FunctionName required",
    );

    await this.background.sequence();

    const functionName = command.input.FunctionName;
    const functionArn = this.functions.functionArn(functionName);
    this.authorizer.authorize(functionArn, options?.caller);

    const { resourcePolicy } = this.functions.require(functionName);

    if (resourcePolicy.isEmpty()) {
      throw new SimLambdaResourceNotFoundException(
        `The resource you requested does not exist. Resource: ${functionArn}`,
      );
    }

    return {
      $metadata: {},
      Policy: JSON.stringify(resourcePolicy.document()),
      RevisionId: resourcePolicy.revisionId,
    };
  }
}
