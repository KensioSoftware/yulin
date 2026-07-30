import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";

/**
 * A queue URL is the only way an SDK request names a queue, and it carries the
 * region and account as well as the name. Real SQS accepts it with or without a
 * trailing slash; its own documented examples show both.
 */
const queueUrlPattern =
  /^https:\/\/sqs\.(?<region>[a-z\d-]+)\.amazonaws\.com\/(?<accountId>\d{12})\/(?<name>[^/]+)\/?$/;

/**
 * The three facts a queue URL carries.
 */
export interface SimSqsQueueUrlParts {
  readonly regionName: AwsRegionName;
  readonly accountId: SimAwsAccountId;
  readonly name: string;
}

/**
 * Reads a queue URL.
 *
 * The region and account matter as much as the name. A queue URL naming
 * another account or region does not reach a local queue that happens to share
 * a name, so the parts are kept rather than the name alone.
 */
export const SimSqsQueueUrl = {
  /**
   * Read the parts of a queue URL, or undefined for a value that is not one.
   */
  parse(value: string): SimSqsQueueUrlParts | undefined {
    const groups = queueUrlPattern.exec(value)?.groups;

    if (groups === undefined) {
      return undefined;
    }

    const { region, accountId, name } = groups;

    /* v8 ignore next 3 -- unreachable: a match always fills every named group,
       but the index signature the regex groups come back as cannot say so. */
    if (region === undefined || accountId === undefined || name === undefined) {
      return undefined;
    }

    return {
      regionName: region as AwsRegionName,
      accountId: accountId as SimAwsAccountId,
      name,
    };
  },
};
