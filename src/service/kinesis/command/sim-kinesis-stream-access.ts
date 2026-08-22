import type { SimAwsResolvedCaller } from "../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simKinesisStreamArn } from "../stream/sim-kinesis-stream-arn.js";
import type { SimKinesisStream } from "../stream/sim-kinesis-stream.js";
import type { SimKinesisStreamStore } from "../stream/sim-kinesis-stream-store.js";
import type { SimKinesisAuthorizer } from "./authorize/sim-kinesis-authorizer.js";
import type { SimKinesisRequestOptions } from "./sim-kinesis-request-options.js";
import {
  simKinesisRefArn,
  simKinesisRefLookupName,
  type SimKinesisStreamRef,
} from "./sim-kinesis-stream-ref.js";

interface SimKinesisStreamAccessProperties {
  readonly streams: SimKinesisStreamStore;
  readonly authorizer: SimKinesisAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * How a request reaches the stream it names.
 *
 * Every operation but ListStreams and CreateStream starts the same way: work
 * out which stream the request means, authorize the action against that
 * stream's ARN, then require the stream to be there.
 *
 * Authorizing before the lookup is what real IAM does, and it is why a caller
 * with no permission is refused for a stream that does not exist rather than
 * being told the stream is missing.
 */
export class SimKinesisStreamAccess {
  private readonly streams: SimKinesisStreamStore;
  private readonly authorizer: SimKinesisAuthorizer;
  private readonly scope: SimAwsAccountRegionScope;

  constructor(properties: SimKinesisStreamAccessProperties) {
    this.streams = properties.streams;
    this.authorizer = properties.authorizer;
    this.scope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on the stream of a given name.
   *
   * The stream need not exist, which is what CreateStream needs. It authorizes
   * against the ARN the stream is about to have.
   */
  authorizeName(
    action: string,
    name: string,
    options?: SimKinesisRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizer.authorizeStream(
      action,
      simKinesisStreamArn(this.scope, name),
      options?.caller,
    );
  }

  /**
   * Ensure the caller may perform an action naming no particular stream.
   */
  authorizeAnyStream(
    action: string,
    options?: SimKinesisRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizer.authorizeAnyStream(action, options?.caller);
  }

  /**
   * Resolve the stream a request names, authorizing the action first.
   */
  require(
    action: string,
    ref: SimKinesisStreamRef,
    options?: SimKinesisRequestOptions,
  ): SimKinesisStream {
    const name = simKinesisRefLookupName(ref, this.scope);

    this.authorizer.authorizeStream(
      action,
      simKinesisRefArn(ref, this.scope),
      options?.caller,
    );

    return this.streams.require(name);
  }
}
