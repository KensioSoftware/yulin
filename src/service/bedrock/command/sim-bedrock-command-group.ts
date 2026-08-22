import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimBedrockValidationException } from "../error/sim-bedrock.error.js";
import { simBedrockModelArn } from "../model/sim-bedrock-model-arn.js";
import type { SimBedrockResponses } from "../response/sim-bedrock-responses.js";
import type { SimBedrockAuthorizer } from "./authorize/sim-bedrock-authorizer.js";
import type { SimBedrockRequestOptions } from "./sim-bedrock-request-options.js";

/**
 * The action every model invocation authorizes against.
 *
 * Real Bedrock authorizes `Converse` with `bedrock:InvokeModel` too. There is
 * no `bedrock:Converse` action to grant.
 */
export const simBedrockInvokeAction = "bedrock:InvokeModel";

export interface SimBedrockCommandGroupProperties {
  readonly responses: SimBedrockResponses;
  readonly authorizer: SimBedrockAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * What both simulated Bedrock invocation handlers are built over.
 *
 * Each one names a model, authorizes against it and answers from the declared
 * responses, so all three come from here and each handler is left with the
 * shape of its own request and response.
 */
export abstract class SimBedrockCommandGroup {
  protected readonly responses: SimBedrockResponses;
  private readonly authorizer: SimBedrockAuthorizer;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimBedrockCommandGroupProperties) {
    this.responses = properties.responses;
    this.authorizer = properties.authorizer;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Read the model a request names.
   *
   * The model id is not resolved against anything. Bedrock offers no
   * enumerable table of model ids to resolve one against, and a model this
   * simulation refused to recognise would be a model Yulin decided did not
   * exist.
   */
  protected requireModelId(
    modelId: string | undefined,
    operation: string,
  ): string {
    if (modelId === undefined || modelId.length === 0) {
      throw new SimBedrockValidationException(
        `${operation} needs a modelId naming the model to invoke`,
      );
    }

    return modelId;
  }

  /**
   * Authorize the caller to invoke one model.
   *
   * This happens after the request has been checked, so a malformed request
   * fails the same way whatever the caller is allowed to do.
   */
  protected authorizeModel(
    modelId: string,
    options: SimBedrockRequestOptions | undefined,
  ): void {
    this.authorizer.authorize(
      simBedrockInvokeAction,
      simBedrockModelArn(this.accountRegionScope, modelId),
      options,
    );
  }
}
