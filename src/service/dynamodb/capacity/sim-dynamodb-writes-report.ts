import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";
import { SimDynamoDbCapacityTallies } from "./sim-dynamodb-capacity-tallies.js";
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
  private readonly tallies = new SimDynamoDbCapacityTallies();
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
   */
  record(
    reference: string,
    table: SimDynamoDbTable,
    write: SimDynamoDbItemWrite,
  ): void {
    simDynamoDbChargeWrite(
      this.tallies.for(reference),
      table,
      write,
      this.transactional,
    );
    this.collections.add(
      reference,
      simDynamoDbWrittenCollectionSize(this.metrics, table, write),
    );
  }

  /**
   * The fields the response carries.
   */
  fields(): SimDynamoDbWritesReportFields {
    return {
      ...this.capacity.each(this.tallies.all()),
      ...this.collections.fields(),
    };
  }
}
