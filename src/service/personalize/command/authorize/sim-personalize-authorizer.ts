import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import { SimIamCallerIdentifier } from "../../../iam/error/sim-iam-caller-identifier.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimPersonalizeAccessDeniedException } from "../../error/sim-personalize.error.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";

/**
 * The resource a Personalize request authorizes against when it has no ARN of
 * its own yet.
 *
 * Every create names the thing it is about to make, which does not exist to be
 * named in a policy, so real Personalize authorizes those against `*`. The
 * describe, list and delete operations name a resource that does exist, and
 * pass its ARN in.
 */
const anyResource = "*";

interface SimPersonalizeAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies simulated IAM authorization to Personalize requests.
 */
export class SimPersonalizeAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly callerIdentifier = new SimIamCallerIdentifier();

  constructor(properties: SimPersonalizeAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may perform an action, on a resource where there is one.
   */
  authorize(
    action: string,
    options: SimPersonalizeRequestOptions = {},
    resource: string = anyResource,
  ): SimAwsResolvedCaller {
    const decision = this.iam.authorize({
      action,
      resource,
      caller: options.caller,
    });

    if (decision.isDenied) {
      throw new SimPersonalizeAccessDeniedException(
        `User: ${this.callerIdentifier.format(decision.caller.principal)} is ` +
          `not authorized to perform: ${action} because no identity-based ` +
          `policy allows the ${action} action`,
      );
    }

    return decision.caller;
  }
}
