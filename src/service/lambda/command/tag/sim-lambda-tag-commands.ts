import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { FunctionUrlAuthorizer } from "../function-url/function-url-authorizer.js";
import { simLambdaTaggedFunction } from "./sim-lambda-tagged-function.js";
import { requiredString } from "../event-source-mapping/create-event-source-mapping-values.js";
import type {
  SimListTagsCommand,
  SimListTagsCommandOutput,
  SimTagResourceCommand,
  SimTagResourceCommandOutput,
  SimUntagResourceCommand,
  SimUntagResourceCommandOutput,
} from "./tag.command.js";

interface SimLambdaTagCommandsProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly functions: SimLambdaFunctionLookup;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

interface SimLambdaTagCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The tagging commands of one simulated Lambda scope.
 *
 * Each one names a function by its ARN, authorizes the IAM action of its own
 * name against that ARN, and then reads or writes the function's tags. A
 * version or alias ARN is refused, because real Lambda keeps tags on the
 * function alone.
 */
export class SimLambdaTagCommands {
  private readonly properties: SimLambdaTagCommandsProperties;

  constructor(properties: SimLambdaTagCommandsProperties) {
    this.properties = properties;
  }

  /**
   * Add tags to a function.
   */
  async tag(
    command: SimTagResourceCommand,
    options?: SimLambdaTagCommandOptions,
  ): Promise<SimTagResourceCommandOutput> {
    const simFunction = await this.taggedFunction(
      "lambda:TagResource",
      command.input.Resource,
      options,
    );

    simFunction.tags.tag(command.input.Tags);

    return { $metadata: {} };
  }

  /**
   * Remove tags from a function.
   */
  async untag(
    command: SimUntagResourceCommand,
    options?: SimLambdaTagCommandOptions,
  ): Promise<SimUntagResourceCommandOutput> {
    const simFunction = await this.taggedFunction(
      "lambda:UntagResource",
      command.input.Resource,
      options,
    );

    simFunction.tags.untag(command.input.TagKeys);

    return { $metadata: {} };
  }

  /**
   * Report a function's tags.
   */
  async list(
    command: SimListTagsCommand,
    options?: SimLambdaTagCommandOptions,
  ): Promise<SimListTagsCommandOutput> {
    const simFunction = await this.taggedFunction(
      "lambda:ListTags",
      command.input.Resource,
      options,
    );

    return { $metadata: {}, Tags: simFunction.tags.record() };
  }

  /**
   * The function a tagging request names, once the caller has been allowed
   * the action on it.
   */
  private async taggedFunction(
    action: string,
    resource: string | undefined,
    options?: SimLambdaTagCommandOptions,
  ): Promise<SimLambdaFunction> {
    const arn = requiredString(resource, "resource");

    // Allow for potential non-deterministic sequencing of async events.
    await this.properties.background.sequence();

    // Authorized before the ARN is resolved, so a caller without the action
    // learns nothing about which functions exist.
    new FunctionUrlAuthorizer({ iam: this.properties.iam, action }).authorize(
      arn,
      options?.caller,
    );

    return simLambdaTaggedFunction(
      arn,
      this.properties.accountRegionScope,
      this.properties.functions,
    );
  }
}
