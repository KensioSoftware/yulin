import type {
  SimIamAuthorizationDecision,
  SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";
import { simSqsConditionContext } from "./sim-sqs-condition-context.js";
import { simSqsQueueResourcePolicies } from "./sim-sqs-queue-resource-policies.js";

interface SimSqsServiceSendAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

interface SimSqsServiceSendAuthorizationInput {
  readonly queue: SimSqsQueue;

  /** The service principal the sending service calls SQS as. */
  readonly servicePrincipal: string;

  /**
   * What the service is sending for, such as the S3 Bucket an event came from.
   */
  readonly sourceArn?: string | undefined;

  /** The Account the sending service's own resource belongs to. */
  readonly sourceAccount?: string | undefined;
}

/**
 * Decides whether a simulated AWS service may send a message to a queue.
 *
 * A service principal owns no identity policies anywhere, so the queue's own
 * policy is the whole decision. The answer is a decision rather than a thrown
 * error because a service asks this before it has a message to send: S3
 * validates the destination when a notification configuration is applied, and
 * has to report the refusal as part of refusing the configuration.
 *
 * A service with a message in hand sends it through `SendMessage` as usual,
 * which authorizes the same way. Nothing is remembered from the earlier
 * question, so a queue policy changed in between stops the delivery.
 */
export class SimSqsServiceSendAuthorizer {
  private static readonly action = "sqs:SendMessage";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimSqsServiceSendAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Evaluate `sqs:SendMessage` for a service against the queue.
   */
  authorize(
    input: SimSqsServiceSendAuthorizationInput,
  ): SimIamAuthorizationDecision {
    return this.iam.authorize({
      action: SimSqsServiceSendAuthorizer.action,
      resource: input.queue.arn.value,
      caller: { kind: "service", service: input.servicePrincipal },
      resourcePolicies: simSqsQueueResourcePolicies(input.queue),
      conditionContext: simSqsConditionContext({
        ...(input.sourceArn !== undefined && { sourceArn: input.sourceArn }),
        ...(input.sourceAccount !== undefined && {
          sourceAccount: input.sourceAccount,
        }),
      }),
    });
  }
}
