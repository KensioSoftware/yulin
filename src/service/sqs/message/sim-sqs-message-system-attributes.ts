import { SimSqsInvalidAttributeName } from "../error/sim-sqs.error.js";

const everySelector = "All";

/**
 * The message system attribute names real SQS accepts on a receive request.
 *
 * The FIFO ones and the tracing one are here because asking for them is valid:
 * real SQS leaves an attribute out when the message has no value for it, so a
 * request naming `MessageGroupId` on a standard queue gets silence rather than a
 * failure. A name that is not an SQS attribute at all is refused.
 */
const knownNames = new Set<string>([
  "ApproximateFirstReceiveTimestamp",
  "ApproximateReceiveCount",
  "AWSTraceHeader",
  "DeadLetterQueueSourceArn",
  "MessageDeduplicationId",
  "MessageGroupId",
  "SenderId",
  "SentTimestamp",
  "SequenceNumber",
]);

/**
 * The message system attributes one receive request asked for.
 *
 * Real SQS returns none of them unless they are named, so a consumer relying on
 * `ApproximateReceiveCount` has to ask for it. Reporting them unasked would let
 * a test read a value that would be missing on AWS.
 */
export class SimSqsRequestedSystemAttributes {
  private readonly names: readonly string[];

  private constructor(names: readonly string[]) {
    this.names = names;
  }

  /**
   * Read the attribute names a receive request asked for, refusing a name real
   * SQS has no such attribute for.
   *
   * `MessageSystemAttributeNames` and the deprecated `AttributeNames` mean the
   * same thing, so both are gathered here.
   */
  static of(
    ...requested: readonly (readonly string[] | undefined)[]
  ): SimSqsRequestedSystemAttributes {
    const names = requested.flatMap((group) => group ?? []);

    for (const name of names) {
      if (name !== everySelector && !knownNames.has(name)) {
        throw new SimSqsInvalidAttributeName(
          `Unknown Attribute ${name}: it is not an SQS message system ` +
            `attribute name`,
        );
      }
    }

    return new this(names);
  }

  /**
   * Pick the requested attributes out of the ones a message has.
   *
   * Undefined means the response carries no `Attributes` at all, which is what
   * real SQS sends when nothing was asked for.
   */
  from(
    available: ReadonlyMap<string, string>,
  ): Record<string, string> | undefined {
    if (this.names.length === 0) {
      return undefined;
    }

    const selected = available
      .entries()
      .filter(([name]) => this.selects(name))
      .toArray();

    if (selected.length === 0) {
      return undefined;
    }

    return Object.fromEntries(selected);
  }

  private selects(name: string): boolean {
    return this.names.includes(everySelector) || this.names.includes(name);
  }
}
