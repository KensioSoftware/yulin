import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimSqsUnsupportedOperation } from "../../error/sim-sqs.error.js";

/**
 * Refuse a request for a queue owned by another Account.
 *
 * One simulated SQS holds one Account's queues, so it has nothing of another
 * Account's to answer with. A queue policy admits another Account's principal
 * to a queue here; it does not make another Account's queues reachable through
 * this one.
 */
export function refuseForeignQueueOwner(
  owner: string | undefined,
  accountId: SimAwsAccountId,
): void {
  if (owner !== undefined && owner !== accountId) {
    throw new SimSqsUnsupportedOperation(
      `QueueOwnerAWSAccountId ${owner} names another Account, and ` +
        `cross-account queue access is not simulated`,
    );
  }
}
