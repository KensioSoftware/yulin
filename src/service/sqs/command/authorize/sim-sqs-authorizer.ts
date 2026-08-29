import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamResourcePolicyInput } from "../../../iam/authorize/context/sim-iam-auth-z-input.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";
import type { SimSqsRequestOptions } from "../sim-sqs-request-options.js";
import { simSqsConditionContext } from "./sim-sqs-condition-context.js";
import { simSqsQueueResourcePolicies } from "./sim-sqs-queue-resource-policies.js";

/**
 * The resource an action with no resource type authorizes against.
 *
 * Real SQS gives ListQueues no resource type at all, so IAM evaluates it
 * against `*` and only a policy whose Resource is `*` allows it. A policy
 * naming a queue ARN, or every queue ARN in the Account and Region, allows no
 * listing, here as on AWS.
 */
const noResource = "*";

interface SimSqsAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

interface SimSqsQueueAuthorizationInput {
  readonly action: string;
  readonly queueArn: string;

  /**
   * The queue itself, when there is one. Its policy is what admits a caller
   * with no identity policy of its own.
   */
  readonly queue?: SimSqsQueue | undefined;

  readonly options?: SimSqsRequestOptions | undefined;
}

interface SimSqsResourceAuthorizationInput {
  readonly action: string;
  readonly resource: string;
  readonly resourcePolicies: readonly SimIamResourcePolicyInput[];
  readonly options: SimSqsRequestOptions | undefined;
}

/**
 * Applies simulated IAM authorization to SQS requests.
 *
 * A queue ARN has no resource type in it, so the resource an operation
 * authorizes against is `arn:aws:sqs:region:account:queue-name`. A policy
 * written with a `queue/` in the resource matches nothing here, as it matches
 * nothing on real AWS.
 *
 * The queue's own policy goes into the decision as its resource policy. That is
 * what admits a caller from another Account or a service principal, since
 * neither is covered by an identity policy in the Account owning the queue.
 *
 * ListQueues is the exception: real SQS gives it no resource type, so it
 * authorizes against `*` rather than against a queue, and no queue policy
 * applies to it.
 */
export class SimSqsAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimSqsAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may perform an action on a queue, named by its ARN.
   *
   * The queue need not exist. A queue that is not there contributes no policy,
   * so a caller with no permission is refused whether or not the queue is
   * there, and CreateQueue authorizes against the ARN the queue is about to
   * have.
   */
  authorizeQueue(input: SimSqsQueueAuthorizationInput): SimAwsResolvedCaller {
    return this.authorizeResource({
      action: input.action,
      resource: input.queueArn,
      resourcePolicies: simSqsQueueResourcePolicies(input.queue),
      options: input.options,
    });
  }

  /**
   * Ensure the caller may perform an action that names no particular queue.
   */
  authorizeAnyQueue(
    action: string,
    options?: SimSqsRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizeResource({
      action,
      resource: noResource,
      resourcePolicies: [],
      options,
    });
  }

  private authorizeResource(
    input: SimSqsResourceAuthorizationInput,
  ): SimAwsResolvedCaller {
    const decision = this.iam.authorize({
      action: input.action,
      resource: input.resource,
      caller: input.options?.caller,
      resourcePolicies: input.resourcePolicies,
      conditionContext: simSqsConditionContext(input.options),
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: input.action,
        resource: input.resource,
      });
    }

    return decision.caller;
  }
}
