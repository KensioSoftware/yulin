import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import { SimIamPassRoleAuthorizer } from "../../../iam/authorize/pass-role/sim-iam-pass-role-authorizer.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simFirehoseServicePrincipal } from "../../sim-firehose-service-principal.js";

interface SimFirehoseAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies simulated IAM authorization to Firehose requests.
 *
 * AWS maps each Firehose API operation to the `firehose:` action of the same
 * name, and the resource is the ARN of the delivery stream the operation names.
 * ListDeliveryStreams is the exception. It names no delivery stream, so it
 * authorizes against `*`.
 *
 * A delivery stream carries a Role for its destination, and a second one for
 * its source where it reads a Kinesis stream. Firehose keeps both and delivers
 * as them later, so creating one authorizes `iam:PassRole` against each.
 */
export class SimFirehoseAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly passRole: SimIamPassRoleAuthorizer;

  constructor(properties: SimFirehoseAuthorizerProperties) {
    this.iam = properties.iam;
    this.passRole = new SimIamPassRoleAuthorizer({
      iam: properties.iam,
      passedToService: simFirehoseServicePrincipal,
    });
  }

  /**
   * Ensure the caller may hand Firehose every Role a delivery stream names.
   *
   * A delivery stream taking records through PutRecord has no source Role, and
   * one left out passes nothing.
   */
  authorizePassRole(
    roleArns: readonly (string | undefined)[],
    caller?: SimAwsCaller,
  ): void {
    this.passRole.authorizeAll(roleArns, caller);
  }

  /**
   * Ensure the caller may perform an action on a delivery stream, named by its
   * ARN.
   *
   * The delivery stream need not exist. Real IAM evaluates a request before the
   * service handles it, so a caller with no permission is refused whether or
   * not the delivery stream is there. That also keeps an unauthorized caller
   * from finding out which delivery stream names are taken.
   */
  authorizeDeliveryStream(
    action: string,
    deliveryStreamArn: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, deliveryStreamArn, caller);
  }

  /**
   * Ensure the caller may perform an action naming no particular delivery
   * stream.
   *
   * Authorization applies to the whole operation. A denied caller receives
   * AccessDenied rather than an empty or filtered listing.
   */
  authorizeAnyDeliveryStream(
    action: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, "*", caller);
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
        reason: decision.denialReason,
        action,
        resource,
      });
    }

    return decision.caller;
  }
}
