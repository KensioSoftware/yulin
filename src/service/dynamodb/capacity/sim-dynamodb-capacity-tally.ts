import type {
  SimDynamoDbCapacity,
  SimDynamoDbConsumedCapacity,
} from "./sim-dynamodb-consumed-capacity.types.js";

/**
 * What one request consumed against a table or an index.
 */
interface SimDynamoDbCapacityCounter {
  read: number;
  write: number;
}

/**
 * Where a request consumed capacity: the table itself, or one of its indexes.
 */
export type SimDynamoDbCapacityTarget =
  | { readonly kind: "table" }
  | { readonly kind: "global" | "local"; readonly name: string };

/**
 * The table itself, as a place capacity is consumed.
 */
export const simDynamoDbTableTarget: SimDynamoDbCapacityTarget = {
  kind: "table",
};

/**
 * The capacity one request consumed against one table and its indexes.
 *
 * A read of an index is charged to the index, and a write to the table is
 * charged to the table and again to each index the write changes, which is how
 * AWS bills a write to an indexed table.
 */
export class SimDynamoDbCapacityTally {
  public readonly tableName: string;
  private readonly table: SimDynamoDbCapacityCounter = { read: 0, write: 0 };
  private readonly global = new Map<string, SimDynamoDbCapacityCounter>();
  private readonly local = new Map<string, SimDynamoDbCapacityCounter>();

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  /**
   * Charge read units to the table or an index.
   */
  read(target: SimDynamoDbCapacityTarget, units: number): void {
    this.counter(target).read += units;
  }

  /**
   * Charge write units to the table or an index.
   */
  write(target: SimDynamoDbCapacityTarget, units: number): void {
    this.counter(target).write += units;
  }

  /**
   * What the request consumed, as `ConsumedCapacity` reports it.
   *
   * `TOTAL` gives the sum alone, and `INDEXES` adds what the table and each
   * index it touched consumed.
   */
  consumedCapacity(withIndexes: boolean): SimDynamoDbConsumedCapacity {
    const counters = [
      this.table,
      ...this.global.values(),
      ...this.local.values(),
    ];
    const total = {
      read: sum(counters.map((counter) => counter.read)),
      write: sum(counters.map((counter) => counter.write)),
    };

    return {
      TableName: this.tableName,
      ...capacity(total),
      ...(withIndexes && {
        Table: capacity(this.table),
        ...indexes("GlobalSecondaryIndexes", this.global),
        ...indexes("LocalSecondaryIndexes", this.local),
      }),
    };
  }

  private counter(
    target: SimDynamoDbCapacityTarget,
  ): SimDynamoDbCapacityCounter {
    if (target.kind === "table") {
      return this.table;
    }

    const counters = target.kind === "global" ? this.global : this.local;
    const existing = counters.get(target.name);

    if (existing !== undefined) {
      return existing;
    }

    const counter = { read: 0, write: 0 };
    counters.set(target.name, counter);

    return counter;
  }
}

/**
 * One counter as a `Capacity`, naming the read and write units only where some
 * were consumed.
 */
function capacity(counter: SimDynamoDbCapacityCounter): SimDynamoDbCapacity {
  return {
    CapacityUnits: counter.read + counter.write,
    ...(counter.read > 0 && { ReadCapacityUnits: counter.read }),
    ...(counter.write > 0 && { WriteCapacityUnits: counter.write }),
  };
}

/**
 * The indexes of one kind a request touched, left out when it touched none.
 */
function indexes(
  field: "GlobalSecondaryIndexes" | "LocalSecondaryIndexes",
  counters: ReadonlyMap<string, SimDynamoDbCapacityCounter>,
): Partial<SimDynamoDbConsumedCapacity> {
  if (counters.size === 0) {
    return {};
  }

  return {
    [field]: Object.fromEntries(
      [...counters].map(([name, counter]) => [name, capacity(counter)]),
    ),
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
