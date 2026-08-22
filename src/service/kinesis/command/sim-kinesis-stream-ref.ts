import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimKinesisInvalidArgumentException } from "../error/sim-kinesis.error.js";
import {
  parseSimKinesisStreamArn,
  simKinesisStreamArn,
} from "../stream/sim-kinesis-stream-arn.js";

/**
 * How a request names the stream it is for.
 *
 * Every Kinesis operation but ListStreams takes either, and real Kinesis reads
 * the ARN when a request carries both.
 */
export interface SimKinesisStreamRef {
  readonly StreamName?: string | undefined;
  readonly StreamARN?: string | undefined;
}

/**
 * The stream name a request carried, refusing one that named neither a name nor
 * an ARN.
 */
function requiredName(name: string | undefined): string {
  if (name === undefined || name === "") {
    throw new SimKinesisInvalidArgumentException(
      "A request has to name a stream by StreamName or by StreamARN",
    );
  }

  return name;
}

/**
 * The ARN of the stream a request names, whichever way it named it.
 */
export function simKinesisRefArn(
  ref: SimKinesisStreamRef,
  scope: SimAwsAccountRegionScope,
): string {
  if (ref.StreamARN !== undefined && ref.StreamARN !== "") {
    return ref.StreamARN;
  }

  return simKinesisStreamArn(scope, requiredName(ref.StreamName));
}

/**
 * The name to look the stream a request names up by.
 *
 * An ARN naming another Account or Region reaches nothing here. Reading its
 * name out and looking that up locally would let a test pass while the real
 * call crossed a boundary it has no permission for, so the ARN itself becomes
 * the lookup key. No stream name can hold a colon, so nothing is found, and the
 * refusal names what the request asked for.
 */
export function simKinesisRefLookupName(
  ref: SimKinesisStreamRef,
  scope: SimAwsAccountRegionScope,
): string {
  if (ref.StreamARN === undefined || ref.StreamARN === "") {
    return requiredName(ref.StreamName);
  }

  const location = parseSimKinesisStreamArn(ref.StreamARN);

  if (
    location === undefined ||
    location.accountId !== scope.accountId ||
    location.regionName !== scope.regionName
  ) {
    return ref.StreamARN;
  }

  return location.name;
}
