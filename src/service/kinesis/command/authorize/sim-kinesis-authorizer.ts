import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface SimKinesisAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies simulated IAM authorization to Kinesis requests.
 *
 * AWS maps each Kinesis API operation to the `kinesis:` action of the same
 * name, and the resource is the ARN of the stream the operation names.
 * ListStreams is the exception. It names no stream, so it authorizes against
 * `*`.
 */
export class SimKinesisAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimKinesisAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may perform an action on a stream, named by its ARN.
   *
   * The stream need not exist. Real IAM evaluates a request before the service
   * handles it, so a caller with no permission is refused whether or not the
   * stream is there, which also keeps an unauthorized caller from finding out
   * which stream names are taken.
   */
  authorizeStream(
    action: string,
    streamArn: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, streamArn, caller);
  }

  /**
   * Ensure the caller may perform an action naming no particular stream.
   *
   * Authorization applies to the whole operation. A denied caller receives
   * AccessDenied rather than an empty or filtered stream listing.
   */
  authorizeAnyStream(
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
