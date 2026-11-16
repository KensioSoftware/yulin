import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";
import { SimDynamoDbCapacityTallies } from "./sim-dynamodb-capacity-tallies.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import { simDynamoDbTableTarget } from "./sim-dynamodb-capacity-tally.js";
import { simDynamoDbReadUnits } from "./sim-dynamodb-capacity-units.js";
import { SimDynamoDbCollectionSizes } from "./sim-dynamodb-collection-sizes.js";
import type { SimDynamoDbConsumedCapacity } from "./sim-dynamodb-consumed-capacity.types.js";
import type { SimDynamoDbItemCollectionSize } from "./sim-dynamodb-item-collection-metrics.js";
import {
  readSimDynamoDbReturnItemCollectionMetrics,
  simDynamoDbWrittenCollectionSize,
} from "./sim-dynamodb-item-collection-request.js";
import { SimDynamoDbReturnConsumedCapacity } from "./sim-dynamodb-return-consumed-capacity.js";
import {
  simDynamoDbChargeWrite,
  type SimDynamoDbItemWrite,
} from "./sim-dynamodb-write-capacity.js";

interface SimDynamoDbWritesReportInput {
  readonly ReturnConsumedCapacity?: string | undefined;
  readonly ReturnItemCollectionMetrics?: string | undefined;
}

/**
 * What a write across several tables answers with about itself.
 */
export interface SimDynamoDbWritesReportFields {
  readonly ConsumedCapacity?: readonly SimDynamoDbConsumedCapacity[];
  readonly ItemCollectionMetrics?: Readonly<
    Record<string, readonly SimDynamoDbItemCollectionSize[]>
  >;
}

/**
 * What BatchWriteItem and TransactWriteItems were asked to report about the
 * writes they made, gathered one write at a time.
 *
 * Capacity is reported once for each table. Item collection sizes are
 * reported once for each collection a write touched, as each stands after the
 * last write to it.
 */
export class SimDynamoDbWritesReport {
  private readonly capacity: SimDynamoDbReturnConsumedCapacity;
  private readonly metrics: boolean;
  private readonly transactional: boolean;
  private readonly charges: ((tallies: SimDynamoDbCapacityTallies) => void)[] =
    [];
  private readonly collections = new SimDynamoDbCollectionSizes();

  private constructor(
    input: SimDynamoDbWritesReportInput,
    transactional: boolean,
  ) {
    this.capacity = SimDynamoDbReturnConsumedCapacity.read(
      input.ReturnConsumedCapacity,
    );
    this.metrics = readSimDynamoDbReturnItemCollectionMetrics(
      input.ReturnItemCollectionMetrics,
    );
    this.transactional = transactional;
  }

  /**
   * Read the reporting inputs of a batch write, refusing a value AWS refuses.
   */
  static batch(input: SimDynamoDbWritesReportInput): SimDynamoDbWritesReport {
    return new this(input, false);
  }

  /**
   * Read the reporting inputs of a transaction, whose writes cost twice as
   * much.
   */
  static transaction(
    input: SimDynamoDbWritesReportInput,
  ): SimDynamoDbWritesReport {
    return new this(input, true);
  }

  /**
   * Record one write to one table, named as the request named it.
   *
   * A write that changed nothing, such as a transaction's condition check, is
   * charged for but has no collection to report.
   */
  record(
    reference: string,
    table: SimDynamoDbTable,
    write: SimDynamoDbItemWrite,
    changed = true,
  ): void {
    this.charges.push((tallies) => {
      simDynamoDbChargeWrite(
        tallies.for(reference),
        table,
        write,
        this.transactional,
      );
    });
    this.collections.add(
      reference,
      simDynamoDbWrittenCollectionSize(this.metrics && changed, table, write),
    );
  }

  /**
   * Record one transactional read of an item, which is what a replayed
   * transaction is charged for in place of its writes.
   */
  recordRead(reference: string, item: SimDynamoDbItem | undefined): void {
    this.charges.push((tallies) => {
      tallies
        .for(reference)
        .read(
          simDynamoDbTableTarget,
          simDynamoDbReadUnits(item?.sizeInBytes() ?? 0, "transactional"),
        );
    });
  }

  /**
   * The fields the response carries.
   */
  fields(): SimDynamoDbWritesReportFields {
    return {
      ...this.capacity.each(() => SimDynamoDbCapacityTallies.of(this.charges)),
      ...this.collections.fields(),
    };
  }
}
