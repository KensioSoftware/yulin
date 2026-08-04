import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimLambdaInvalidParameterValueException } from "../error/sim-lambda.error.js";
import type { SimLambdaEventSourceArn } from "./sim-lambda-event-source-arn.js";

interface SimLambdaEventSourceRolePermissionsProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Checks that a function's execution role may poll the source a mapping names.
 *
 * Real Lambda refuses to create the mapping at all when the role cannot poll,
 * rather than creating one that silently delivers nothing, so this is checked
 * up front here too. The poller's own calls go through simulated IAM again
 * afterwards, as they do on AWS: this check is about failing early, not about
 * standing in for authorization.
 *
 * What has to be allowed comes from the event source, since the operations a
 * poller performs are the source's own.
 */
export class SimLambdaEventSourceRolePermissions {
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimLambdaEventSourceRolePermissionsProperties) {
    this.iam = properties.iam;
  }

  /**
   * Refuse a mapping whose execution role cannot poll the event source.
   */
  assertMayPoll(
    roleArn: string,
    eventSourceArn: SimLambdaEventSourceArn,
  ): void {
    for (const permission of eventSourceArn.pollingPermissions) {
      const decision = this.iam.authorize({
        action: permission.action,
        resource: permission.resource,
        caller: { kind: "arn", arn: roleArn },
      });

      if (decision.isDenied) {
        throw new SimLambdaInvalidParameterValueException(
          "The provided execution role does not have permissions to call " +
            `${permission.operationName} on ${eventSourceArn.serviceLabel}. ` +
            `Role ${roleArn} has no policy allowing ` +
            `${permission.action} on ${permission.resource}`,
        );
      }
    }
  }
}
