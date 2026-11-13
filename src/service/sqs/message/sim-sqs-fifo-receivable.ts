import type { SimSqsMessage } from "./sim-sqs-message.js";

/**
 * The messages a FIFO queue could hand out at an instant, in the order it
 * hands them out.
 *
 * A message group with a message in flight hands out nothing at all. Real SQS
 * hands out no more of a group until its in-flight messages are deleted or
 * visible again, and that holds wherever in the group the in-flight message
 * sits: a consumer given two messages of a group can give the first back while
 * still holding the second. A message still waiting out its delay holds back
 * the messages of its group behind it, which keeps the group in order.
 *
 * Of the groups left, the one whose oldest message is oldest goes first, and as
 * many of its messages as there are come before the next group's, since real
 * SQS returns as many messages from one group as it can.
 */
export function simSqsFifoReceivable(
  messages: readonly SimSqsMessage[],
  instant: Date,
): readonly SimSqsMessage[] {
  const blocked = new Set(
    messages
      .filter((message) => message.isInFlightAt(instant))
      .map((message) => message.messageGroupId),
  );
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
