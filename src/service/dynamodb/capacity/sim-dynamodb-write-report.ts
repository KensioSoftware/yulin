import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";
import { SimDynamoDbCapacityTally } from "./sim-dynamodb-capacity-tally.js";
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

/**
 * The inputs a write takes for reporting what it did.
 */
interface SimDynamoDbWriteReportInput {
  readonly ReturnConsumedCapacity?: string | undefined;
  readonly ReturnItemCollectionMetrics?: string | undefined;
}

/**
 * What a single-item write answers with about itself, beyond the item.
 */
export interface SimDynamoDbWriteReportFields {
  readonly ConsumedCapacity?: SimDynamoDbConsumedCapacity;
  readonly ItemCollectionMetrics?: SimDynamoDbItemCollectionSize;
}

/**
 * What PutItem, UpdateItem and DeleteItem were asked to report about the
 * write they made.
 */
export class SimDynamoDbWriteReport {
  private readonly capacity: SimDynamoDbReturnConsumedCapacity;
  private readonly metrics: boolean;

  private constructor(
    capacity: SimDynamoDbReturnConsumedCapacity,
    metrics: boolean,
  ) {
    this.capacity = capacity;
    this.metrics = metrics;
  }

  /**
   * Read both reporting inputs, refusing a value AWS refuses.
   */
  static read(input: SimDynamoDbWriteReportInput): SimDynamoDbWriteReport {
    return new this(
      SimDynamoDbReturnConsumedCapacity.read(input.ReturnConsumedCapacity),
      readSimDynamoDbReturnItemCollectionMetrics(
        input.ReturnItemCollectionMetrics,
      ),
    );
  }

  /**
   * The fields reporting one write to one table.
   *
   * The table is named as the request named it, so a request naming the table
   * by its ARN is answered with the ARN, as AWS answers it.
   */
  of(
    tableName: string | undefined,
    table: SimDynamoDbTable,
    write: SimDynamoDbItemWrite,
  ): SimDynamoDbWriteReportFields {
    const tally = new SimDynamoDbCapacityTally(tableName ?? table.tableName);
    simDynamoDbChargeWrite(tally, table, write, false);

    const size = simDynamoDbWrittenCollectionSize(this.metrics, table, write);

    return {
      ...this.capacity.one(tally),
      ...(size !== undefined && { ItemCollectionMetrics: size }),
    };
  }
}
