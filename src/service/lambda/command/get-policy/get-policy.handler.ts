import type { CommandHandler } from "../../../../command/command-handler.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import { simLambdaQualifiedFunctionOf } from "../../function/sim-lambda-function-reference.js";
import type { SimLambdaFunctionVersionStore } from "../../function/version/sim-lambda-function-version-store.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { FunctionUrlAuthorizer } from "../function-url/function-url-authorizer.js";
import type {
  SimGetPolicyCommand,
  SimGetPolicyCommandOutput,
} from "./get-policy.command.js";

interface GetPolicyCommandHandlerProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly versions: SimLambdaFunctionVersionStore;
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
  private readonly versions: SimLambdaFunctionVersionStore;
  private readonly authorizer: FunctionUrlAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetPolicyCommandHandlerProperties) {
    this.functions = properties.functions;
    this.versions = properties.versions;
    this.authorizer = new FunctionUrlAuthorizer({
      iam: properties.iam,
      action: "lambda:GetPolicy",
    });
    this.background = properties.background;
  }

  /**
   * Read the resource policy of a sim Lambda function, or of the version or
   * alias a qualifier names.
   *
   * A resource that has been granted nothing has no policy at all, which real
   * Lambda reports as the policy not being found rather than as an empty
   * document. Each qualified resource answers with its own statements, so the
   * function's policy is what a request with no qualifier reads.
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

    const { functionName, qualifier } = simLambdaQualifiedFunctionOf(
      command.input.FunctionName,
      command.input.Qualifier,
    );
    const functionArn = this.functions.functionArn(functionName, qualifier);
    this.authorizer.authorize(functionArn, options?.caller);

    const { resourcePolicy } = this.versions.requireResource(
      this.functions.require(functionName),
      qualifier,
    );

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
