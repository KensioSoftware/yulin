import type { SimSqsMessage } from "./sim-sqs-message.js";

/**
 * The messages a FIFO queue could hand out at an instant, in the order it
 * hands them out.
 *
 * A message group with a message that cannot be received, because it is in
 * flight or still delayed, hands out nothing after that message. Real SQS
 * hands out no more of a group until its in-flight messages are deleted or
 * visible again, which is what keeps the group in order. Of the groups left,
 * the one whose oldest message is oldest goes first, and as many of its
 * messages as there are come before the next group's, since real SQS returns
 * as many messages from one group as it can.
 *
 * The messages are held oldest first, so an in-flight message always comes
 * before the messages of its group that are waiting behind it.
 */
export function simSqsFifoReceivable(
  messages: readonly SimSqsMessage[],
  instant: Date,
): readonly SimSqsMessage[] {
  const blocked = new Set<string | undefined>();
  const groups = new Map<string | undefined, SimSqsMessage[]>();

  for (const message of messages) {
    const group = message.messageGroupId;

    if (!message.isVisibleAt(instant)) {
      blocked.add(group);
    } else if (!blocked.has(group)) {
      groups.set(group, [...(groups.get(group) ?? []), message]);
    }
  }

  return groups.values().toArray().flat();
}
