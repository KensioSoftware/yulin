import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbCapacityTally } from "./sim-dynamodb-capacity-tally.js";
import type { SimDynamoDbConsumedCapacity } from "./sim-dynamodb-consumed-capacity.types.js";

const levels = ["INDEXES", "TOTAL", "NONE"] as const;

type SimDynamoDbCapacityLevel = (typeof levels)[number];

/**
 * Refuse a value outside an enum, in the words AWS refuses it in.
 */
export function assertSimDynamoDbEnumValue<Value extends string>(
  value: string,
  allowed: readonly Value[],
  field: string,
): asserts value is Value {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new SimDynamoDbValidationException(
      `1 validation error detected: Value '${value}' at '${field}' failed to ` +
        `satisfy constraint: Member must satisfy enum value set: ` +
        `[${allowed.join(", ")}]`,
    );
  }
}

/**
 * What a request asked to be told about the capacity it consumed.
 *
 * `NONE`, the default, reports nothing. `TOTAL` reports what each table
 * consumed, and `INDEXES` adds what the table and each index it touched
 * consumed apart.
 */
export class SimDynamoDbReturnConsumedCapacity {
  private readonly level: SimDynamoDbCapacityLevel;

  private constructor(level: SimDynamoDbCapacityLevel) {
    this.level = level;
  }

  /**
   * Read the `ReturnConsumedCapacity` a request carries.
   */
  static read(level = "NONE"): SimDynamoDbReturnConsumedCapacity {
    assertSimDynamoDbEnumValue(level, levels, "returnConsumedCapacity");

    return new this(level);
  }

  /**
   * The `ConsumedCapacity` a request on one table answers with.
   *
   * The tally is measured only when the request asked for a report, so a
   * request that did not pays nothing for it.
   */
  one(measure: () => SimDynamoDbCapacityTally): {
    readonly ConsumedCapacity?: SimDynamoDbConsumedCapacity;
  } {
    if (this.level === "NONE") {
      return {};
    }

    return { ConsumedCapacity: measure().consumedCapacity(this.withIndexes) };
  }

  /**
   * The `ConsumedCapacity` a request on several tables answers with, one entry
   * for each table.
   */
  each(measure: () => readonly SimDynamoDbCapacityTally[]): {
    readonly ConsumedCapacity?: readonly SimDynamoDbConsumedCapacity[];
  } {
    if (this.level === "NONE") {
      return {};
    }

    return {
      ConsumedCapacity: measure().map((tally) =>
        tally.consumedCapacity(this.withIndexes),
      ),
    };
  }

  private get withIndexes(): boolean {
    return this.level === "INDEXES";
  }
}
