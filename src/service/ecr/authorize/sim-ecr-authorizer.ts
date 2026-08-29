import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import type { SimEcrRepositoryAddress } from "../repository/sim-ecr-repository-address.js";

interface SimEcrAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly address: SimEcrRepositoryAddress;
}

/**
 * Applies simulated IAM authorization to ECR requests.
 *
 * Registering a simulated image is not one of them. That is a Yulin-native
 * operation on the simulator's own accessor, and it is how a test says what an
 * image is. A CloudFormation deployment is what authorizes here. It makes and
 * removes a repository as the caller its Stack named.
 */
export class SimEcrAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly address: SimEcrRepositoryAddress;

  constructor(properties: SimEcrAuthorizerProperties) {
    this.iam = properties.iam;
    this.address = properties.address;
  }

  /**
   * Ensure the caller may perform an action on a repository of this name.
   *
   * The repository need not be there. Real IAM evaluates a request before the
   * service handles it, so a caller with no permission is refused whether or
   * not the repository is there, and `CreateRepository` authorizes against the
   * ARN the repository is about to have.
   */
  authorizeRepository(
    action: string,
    repositoryName: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    const resource = this.address.arn(repositoryName);
    const decision = this.iam.authorize({ action, resource, caller });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action,
        resource,
      });
    }

    return decision.caller;
  }
}
