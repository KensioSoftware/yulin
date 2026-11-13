import type { SimSqsPollMessage } from "./sim-sqs-poll-message.js";

/**
 * The most messages one ReceiveMessage or DeleteMessageBatch takes.
 */
const requestLimit = 10;

/**
 * Gather a batch over as many receives as it takes, ten at a time, stopping
 * early once a receive comes back short.
 */
export async function simSqsGatheredBatch(
  batchSize: number,
  receiveUpTo: (count: number) => Promise<readonly SimSqsPollMessage[]>,
): Promise<readonly SimSqsPollMessage[]> {
  const received: SimSqsPollMessage[] = [];

  while (received.length < batchSize) {
    const wanted = Math.min(requestLimit, batchSize - received.length);
    // oxlint-disable-next-line no-await-in-loop -- each receive follows the last
    const messages = await receiveUpTo(wanted);
    received.push(...messages);

    if (messages.length < wanted) {
      break;
    }
  }

  return received;
}

/**
 * The receipt handles of a handled batch, in groups of ten or fewer for
 * DeleteMessageBatch.
 */
export function simSqsDeleteGroups(
  receiptHandles: readonly string[],
): (readonly string[])[] {
  return Array.from(
    { length: Math.ceil(receiptHandles.length / requestLimit) },
    (_, group) =>
      receiptHandles.slice(group * requestLimit, (group + 1) * requestLimit),
  );
}
