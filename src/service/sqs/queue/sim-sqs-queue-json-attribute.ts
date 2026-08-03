import type { SimSqsQueueAttributeInput } from "./sim-sqs-queue-attributes.js";

/**
 * What a queue attribute holding a JSON document has to be able to do: report
 * the string it was set with, and say whether another one says the same thing.
 */
export interface SimSqsQueueJsonAttributeValue<T> {
  readonly value: string;
  matches(other: T): boolean;
}

interface SimSqsQueueJsonAttributeProperties<T> {
  readonly name: string;
  readonly parse: (value: string) => T;
  readonly held: T | undefined;
}

/**
 * One queue attribute that is a JSON document rather than an amount.
 *
 * The redrive policy and the queue policy are both this: parsed and validated
 * when they are set, absent until then, and reported back as the string they
 * were set with rather than as a re-serialised version of it. Only the parsing
 * differs, so it is the one thing this is given.
 */
export class SimSqsQueueJsonAttribute<
  T extends SimSqsQueueJsonAttributeValue<T>,
> {
  private readonly name: string;
  private readonly parse: (value: string) => T;
  private readonly held: T | undefined;

  constructor(properties: SimSqsQueueJsonAttributeProperties<T>) {
    this.name = properties.name;
    this.parse = properties.parse;
    this.held = properties.held;
  }

  /**
   * The document the queue holds, or nothing when none has been set.
   */
  get document(): T | undefined {
    return this.held;
  }

  /**
   * This attribute after a request, which holds the document the request sets
   * or the one already there.
   */
  with(requested: SimSqsQueueAttributeInput): SimSqsQueueJsonAttribute<T> {
    const value = this.valueIn(requested);

    if (value === undefined) {
      return this;
    }

    return new SimSqsQueueJsonAttribute({
      name: this.name,
      parse: this.parse,
      held: this.parse(value),
    });
  }

  /**
   * Whether the document a request names is the one already held, which is the
   * question a repeated CreateQueue asks. A request naming none matches.
   */
  matches(requested: SimSqsQueueAttributeInput): boolean {
    const value = this.valueIn(requested);

    if (value === undefined) {
      return true;
    }

    return this.held?.matches(this.parse(value)) === true;
  }

  /**
   * Add this attribute to what SQS reports about the queue, leaving it out when
   * the queue has no value for it.
   */
  reportInto(reported: Map<string, string>): void {
    if (this.held !== undefined) {
      reported.set(this.name, this.held.value);
    }
  }

  /**
   * The value a request carries for this attribute, if it carries one.
   */
  private valueIn(requested: SimSqsQueueAttributeInput): string | undefined {
    return Object.entries(requested).find(([key]) => key === this.name)?.[1];
  }
}
