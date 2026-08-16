import type { DeepPartialObject, ItemFactory } from "@kensio/part-factory";

/**
 * An event delivered as a list of records, which is the shape AWS uses
 * wherever a source can batch: SQS, DynamoDB streams, S3 notifications.
 */
export interface SimRecordsEvent<Record_ extends object> {
  readonly Records: readonly Record_[];
}

/**
 * What a test says about the records it wants the event to carry.
 *
 * This is `DeepPartialObject<SimRecordsEvent<Record_>>` written out. It is
 * written out because that type only resolves to a list of partial records
 * once the record type is a real one, which it is at every call, and is not
 * while the record type is still this class's parameter.
 */
interface SimRecordsEventOverrides<Record_ extends object> {
  readonly Records?: readonly DeepPartialObject<Record_>[] | undefined;
}

/**
 * Makes an event carrying a list of records, from the factory for one record.
 *
 * A test says what it cares about in each record and nothing else:
 *
 * ```typescript
 * lambdaSqsEventFactory.make({
 *   Records: [{ body: "first" }, { body: "second" }],
 * });
 * ```
 *
 * That is the reason this is a factory of its own rather than a
 * `DynamicFactory` whose defaults hold one record. Overrides are merged onto
 * defaults, and merging replaces an array whole rather than element by element,
 * so a partial record passed that way would reach the test as the only thing
 * in that record — typed as a complete one, and missing every field the
 * handler under test reads. Here each partial record is passed through the
 * record factory instead, so the records are as complete as a delivered event's
 * are, however many of them a test asks for.
 *
 * Asking for no records at all gives an event with none, which is an event no
 * real source delivers and a handler is still entitled to be tested against.
 *
 * One of these is an `ItemFactory` for the event it makes, so it composes with
 * `VariantFactory` like any other factory. Each service says so where it
 * exports its own, by typing the export, rather than this class declaring it:
 * `implements` would have to be checked while the record type is still a
 * parameter, and the partial of an unresolved type parameter is not yet the
 * partial object a record's is.
 */
export class SimRecordsEventFactory<Record_ extends object> {
  private readonly recordFactory: ItemFactory<Record_>;

  constructor(recordFactory: ItemFactory<Record_>) {
    this.recordFactory = recordFactory;
  }

  /**
   * Make the event, completing each record a test asked for and defaulting to
   * a single record when it asked for none in particular.
   */
  make(
    overrides: SimRecordsEventOverrides<Record_> = {},
  ): SimRecordsEvent<Record_> {
    const records = overrides.Records ?? [{}];

    return {
      Records: records.map((record) => this.recordFactory.make(record)),
    };
  }
}
