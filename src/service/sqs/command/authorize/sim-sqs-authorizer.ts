import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { sqsAnyQueueArn } from "../../queue/sim-sqs-queue-arn.js";

interface SimSqsAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Applies simulated IAM authorization to SQS requests.
 *
 * A queue ARN has no resource type in it, so the resource an operation
 * authorizes against is `arn:aws:sqs:region:account:queue-name`. A policy
 * written with a `queue/` in the resource matches nothing here, as it matches
 * nothing on real AWS.
 *
 * ListQueues is the exception: real SQS gives it no queue-level permission, so
 * it authorizes against every queue in the account and region rather than one of
 * them. A policy naming a single queue ARN therefore allows no listing.
 */
export class SimSqsAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimSqsAuthorizerProperties) {
    this.iam = properties.iam;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on a queue, named by its ARN.
   *
   * The queue need not exist. Real IAM evaluates a request before the service
   * handles it, so a caller with no permission is refused whether or not the
   * queue is there, and CreateQueue authorizes against the ARN the queue is
   * about to have.
   */
  authorizeQueue(
    action: string,
    queueArn: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, queueArn, caller);
  }

  /**
   * Ensure the caller may perform an action that names no particular queue.
   */
  authorizeAnyQueue(
    action: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(
      action,
      sqsAnyQueueArn(this.accountRegionScope),
      caller,
    );
  }

  private authorizeResource(
    action: string,
    resource: string,
    caller: SimAwsCaller | undefined,
  ): SimAwsResolvedCaller {
    const decision = this.iam.authorize({ action, resource, caller });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action,
        resource,
      });
    }

    return decision.caller;
  }
}
