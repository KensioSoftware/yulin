import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimDynamoDbItemPage } from "../item/sim-dynamodb-item-page.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import type { SimScanCommand, SimScanCommandOutput } from "./scan.command.js";
import { readSimDynamoDbScanSegment } from "./sim-dynamodb-scan-segment-input.js";
import { readSimDynamoDbScanStartKey } from "./sim-dynamodb-scan-start-key.js";
import { refuseUnsimulatedScanInput } from "./sim-dynamodb-unsimulated-scan-input.js";

interface SimDynamoDbScanProperties {
  readonly access: SimDynamoDbTableAccess;
}

interface SimDynamoDbScanOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The Scan command.
 *
 * A scan reads the whole table rather than one item collection, so it needs no
 * key knowledge at all. That is what makes it the operation test setup and
 * assertions reach for, and the wrong operation for most application access
 * patterns.
 *
 * `ConsistentRead` is accepted and changes nothing. Every write here has landed
 * before the call that made it returned, so a simulated scan is always the
 * strongly consistent read.
 */
export class SimDynamoDbScan {
  private readonly access: SimDynamoDbTableAccess;

  constructor(properties: SimDynamoDbScanProperties) {
    this.access = properties.access;
  }

  /**
   * Read a page of the table, or of one segment of it.
   */
  handle(
    command: SimScanCommand,
    options?: SimDynamoDbScanOptions,
  ): SimScanCommandOutput {
    const input = command.input;

    refuseUnsimulatedScanInput(input);

    // The segment is read before the table is reached, so a division DynamoDB
    // would refuse is refused whether or not the table is there.
    const segment = readSimDynamoDbScanSegment(input);
    const table = this.access.required(
      "dynamodb:Scan",
      input.TableName,
      options?.caller,
    );
    const scan = table.scan();

    // The token names a place in this table's scan order, so it can only be
    // checked once that order is known.
    const after = readSimDynamoDbScanStartKey({
      table,
      scan,
      segment,
      exclusiveStartKey: input.ExclusiveStartKey,
    });

    const page = new SimDynamoDbItemPage({
      items: scan.walk({ segment, after }),
      limit: input.Limit,
      keySchema: table.keySchema,
    });

    return {
      Items: page.items.map((item) => item.toAttributeValues()),
      // Nothing filters a scan yet, so every item the walk evaluated is an item
      // the page carries.
      Count: page.items.length,
      ScannedCount: page.items.length,
      LastEvaluatedKey: page.lastEvaluatedKey,
      $metadata: {},
    };
  }
}
