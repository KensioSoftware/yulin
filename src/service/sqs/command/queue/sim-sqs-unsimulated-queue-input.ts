import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimSqsUnsupportedOperation } from "../../error/sim-sqs.error.js";
import type { SimCreateQueueCommandInput } from "./queue.command.js";

/**
 * Refuse the queue request inputs this simulation does not model.
 *
 * Dropping a tag would leave a queue looking tagged to the request that sent it
 * and untagged to everything else, and answering a request for another Account's
 * queue with a local one of the same name would let a test pass while the real
 * call crossed a boundary it has no permission for. Both are refused instead.
 */
export function refuseUnsimulatedQueueInput(
  input: SimCreateQueueCommandInput,
): void {
  if (input.tags !== undefined) {
    throw new SimSqsUnsupportedOperation(
      "Queue tags are not simulated, so CreateQueue refuses them rather than " +
        "dropping them",
    );
  }
}

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
