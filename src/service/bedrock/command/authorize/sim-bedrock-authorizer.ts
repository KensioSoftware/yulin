import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamCallerIdentifier } from "../../../iam/error/sim-iam-caller-identifier.js";
import { SimBedrockAccessDeniedException } from "../../error/sim-bedrock.error.js";
import type { SimBedrockRequestOptions } from "../sim-bedrock-request-options.js";

interface SimBedrockAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies simulated IAM authorization to Bedrock requests.
 *
 * Every invocation names a model, and real Bedrock authorizes it against that
 * model's ARN. A policy allowing one foundation model and denying another is
 * the policy worth being able to test, which is what makes the resource
 * required here rather than optional.
 */
export class SimBedrockAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly callerIdentifier = new SimIamCallerIdentifier();

  constructor(properties: SimBedrockAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may perform an action on a model.
   */
  authorize(
    action: string,
    resource: string,
    options: SimBedrockRequestOptions = {},
  ): SimAwsResolvedCaller {
    const decision = this.iam.authorize({
      action,
      resource,
      caller: options.caller,
    });

    if (decision.isDenied) {
      throw new SimBedrockAccessDeniedException(
        `User: ${this.callerIdentifier.format(decision.caller.principal)} is ` +
          `not authorized to perform: ${action} on resource: ${resource} ` +
          `because no identity-based policy allows the ${action} action`,
      );
    }

    return decision.caller;
  }
}
