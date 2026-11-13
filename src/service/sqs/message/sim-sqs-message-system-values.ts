/**
 * What a message knows about itself that SQS reports as system attributes.
 */
export interface SimSqsMessageSystemFacts {
  readonly sentAt: Date;
  readonly receiveCount: number;
  readonly firstReceived: Date;
  readonly deadLetterSourceArn: string | undefined;
  readonly traceHeader: string | undefined;
}

/**
 * The message system attributes SQS knows about a message, leaving out the
 * ones the message has no value for, as real SQS leaves them out.
 */
export function simSqsMessageSystemValues(
  facts: SimSqsMessageSystemFacts,
): ReadonlyMap<string, string> {
  const optional: [string, string | undefined][] = [
    ["DeadLetterQueueSourceArn", facts.deadLetterSourceArn],
    ["AWSTraceHeader", facts.traceHeader],
  ];

  return new Map<string, string>([
    ["SentTimestamp", String(facts.sentAt.getTime())],
    ["ApproximateReceiveCount", String(facts.receiveCount)],
    ["ApproximateFirstReceiveTimestamp", String(facts.firstReceived.getTime())],
    ...optional.filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  ]);
}
