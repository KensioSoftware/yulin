import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimLambdaInvalidParameterValueException } from "../error/sim-lambda.error.js";

/**
 * What a function's execution role has to be allowed to do on a queue for
 * Lambda to poll it.
 *
 * These are the three operations real Lambda checks when an SQS event source
 * mapping is created, and the three its poller performs afterwards.
 */
const requiredQueueOperations = [
  "ReceiveMessage",
  "DeleteMessage",
  "GetQueueAttributes",
] as const;

interface SimLambdaEventSourceRolePermissionsProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Checks that a function's execution role may poll the queue a mapping names.
 *
 * Real Lambda refuses to create the mapping at all when the role cannot poll,
 * rather than creating one that silently delivers nothing, so this is checked
 * up front here too. The poller's own calls go through simulated IAM again
 * afterwards, as they do on AWS: this check is about failing early, not about
 * standing in for authorization.
 */
export class SimLambdaEventSourceRolePermissions {
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimLambdaEventSourceRolePermissionsProperties) {
    this.iam = properties.iam;
  }

  /**
   * Refuse a mapping whose execution role cannot poll the queue.
   */
  assertMayPoll(roleArn: string, queueArn: string): void {
    for (const operation of requiredQueueOperations) {
      const decision = this.iam.authorize({
        action: `sqs:${operation}`,
        resource: queueArn,
        caller: { kind: "arn", arn: roleArn },
      });

      if (decision.isDenied) {
        throw new SimLambdaInvalidParameterValueException(
          `The provided execution role does not have permissions to call ` +
            `${operation} on SQS. Role ${roleArn} has no policy allowing ` +
            `sqs:${operation} on ${queueArn}`,
        );
      }
    }
  }
}
