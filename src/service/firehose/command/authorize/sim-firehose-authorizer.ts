import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

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
 */
export class SimFirehoseAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimFirehoseAuthorizerProperties) {
    this.iam = properties.iam;
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
        action,
        resource,
      });
    }

    return decision.caller;
  }
}
