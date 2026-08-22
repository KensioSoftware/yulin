import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

const streamArnPartition = "aws";

const streamArnService = "kinesis";

const streamArnResourceType = "stream";

/**
 * Where one stream is, in the three facts its ARN carries.
 *
 * The strings are unbranded because the callers that have only read an ARN,
 * rather than been handed a scope, have nothing but strings to offer.
 */
export interface SimKinesisStreamLocation {
  readonly regionName: string;
  readonly accountId: string;
  readonly name: string;
}

/**
 * The ARN of a stream of a given name in an Account and Region.
 */
export function simKinesisStreamArn(
  accountRegionScope: SimAwsAccountRegionScope,
  name: string,
): string {
  const { regionName, accountId } = accountRegionScope;

  return `arn:${streamArnPartition}:${streamArnService}:${regionName}:${accountId}:${streamArnResourceType}/${name}`;
}

/**
 * Read a stream ARN into the Region, Account and name it carries.
 *
 * All three matter. An ARN naming another Account or Region reaches nothing in
 * a simulated Kinesis scope rather than having its name read out and looked up
 * locally, since treating a foreign one as local would let a test pass while
 * the real call crossed a boundary it has no permission for.
 *
 * Nothing is returned for a string that is not a stream ARN, including a
 * consumer ARN, which carries the consumer name and creation time after the
 * stream name.
 */
export function parseSimKinesisStreamArn(
  value: string,
): SimKinesisStreamLocation | undefined {
  const parts = value.split(":");

  if (parts.length !== 6) {
    return undefined;
  }

  const [prefix, partition, service, regionName, accountId, resource] = parts;

  if (
    prefix !== "arn" ||
    partition !== streamArnPartition ||
    service !== streamArnService ||
    regionName === undefined ||
    regionName === "" ||
    accountId === undefined ||
    accountId === "" ||
    resource === undefined
  ) {
    return undefined;
  }

  if (!resource.startsWith(`${streamArnResourceType}/`)) {
    return undefined;
  }

  const name = resource.slice(`${streamArnResourceType}/`.length);

  return name === "" || name.includes("/")
    ? undefined
    : { regionName, accountId, name };
}
