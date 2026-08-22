import type { SimAwsResolvedCaller } from "../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimFirehoseInvalidArgumentException } from "../error/sim-firehose.error.js";
import { simFirehoseDeliveryStreamArn } from "../stream/sim-firehose-delivery-stream-arn.js";
import type { SimFirehoseDeliveryStream } from "../stream/sim-firehose-delivery-stream.js";
import type { SimFirehoseDeliveryStreamStore } from "../stream/sim-firehose-delivery-stream-store.js";
import type { SimFirehoseAuthorizer } from "./authorize/sim-firehose-authorizer.js";
import type { SimFirehoseRequestOptions } from "./sim-firehose-request-options.js";

interface SimFirehoseDeliveryStreamAccessProperties {
  readonly deliveryStreams: SimFirehoseDeliveryStreamStore;
  readonly authorizer: SimFirehoseAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * How a request reaches the delivery stream it names.
 *
 * Every operation but ListDeliveryStreams and CreateDeliveryStream starts the
 * same way: authorize the action against the ARN the named delivery stream
 * would have, then require the delivery stream to be there.
 *
 * Authorizing before the lookup is what real IAM does. It is why a caller with
 * no permission is refused for a delivery stream that does not exist, rather
 * than being told the delivery stream is missing.
 */
export class SimFirehoseDeliveryStreamAccess {
  private readonly deliveryStreams: SimFirehoseDeliveryStreamStore;
  private readonly authorizer: SimFirehoseAuthorizer;
  private readonly scope: SimAwsAccountRegionScope;

  constructor(properties: SimFirehoseDeliveryStreamAccessProperties) {
    this.deliveryStreams = properties.deliveryStreams;
    this.authorizer = properties.authorizer;
    this.scope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on the delivery stream of a given
   * name.
   *
   * The delivery stream need not exist, which is what CreateDeliveryStream
   * needs. It authorizes against the ARN the delivery stream is about to have.
   */
  authorizeName(
    action: string,
    name: string,
    options?: SimFirehoseRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizer.authorizeDeliveryStream(
      action,
      simFirehoseDeliveryStreamArn(this.scope, name),
      options?.caller,
    );
  }

  /**
   * Ensure the caller may perform an action naming no particular delivery
   * stream.
   */
  authorizeAny(
    action: string,
    options?: SimFirehoseRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizer.authorizeAnyDeliveryStream(action, options?.caller);
  }

  /**
   * Resolve the delivery stream a request names, authorizing the action first.
   */
  require(
    action: string,
    name: string | undefined,
    options?: SimFirehoseRequestOptions,
  ): SimFirehoseDeliveryStream {
    const named = requiredName(name);

    this.authorizeName(action, named, options);

    return this.deliveryStreams.require(named);
  }
}

/**
 * The delivery stream name a request carried, refusing one that named none.
 */
function requiredName(name: string | undefined): string {
  if (name === undefined || name === "") {
    throw new SimFirehoseInvalidArgumentException(
      "A request has to name a delivery stream by DeliveryStreamName",
    );
  }

  return name;
}
