import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimDynamoDbItemPage } from "../item/sim-dynamodb-item-page.js";
import { SimDynamoDbReadAnswer } from "../read/sim-dynamodb-read-answer.js";
import { assertSimDynamoDbConsistentReadAnswerable } from "../read/sim-dynamodb-consistent-read.js";
import { SimDynamoDbSelect } from "../read/sim-dynamodb-select.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import type { SimScanCommand, SimScanCommandOutput } from "./scan.command.js";
import { readSimDynamoDbScanExpressions } from "./sim-dynamodb-scan-expressions.js";
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

    // Which attributes the request asks for is read first, since it decides
    // whether the projection the request carries is one it could have asked
    // for at all.
    const select = SimDynamoDbSelect.from(input);

    refuseUnsimulatedScanInput(input);

    // The segment and the expressions are read before the table is reached, so
    // input DynamoDB would refuse is refused whether or not the table is
    // there. A scan narrows nothing, so unlike a query its filter may name any
    // attribute, including a key attribute, and needs no key schema to check.
    const segment = readSimDynamoDbScanSegment(input);
    const expressions = readSimDynamoDbScanExpressions(input);
    const table = this.access.required(
      "dynamodb:Scan",
      input.TableName,
      options?.caller,
    );

    // What is being read is settled here: the table, or one of its indexes.
    const view = table.view(input.IndexName);
    const scan = view.scan();

    // Whether a strongly consistent read is answerable depends on which of the
    // two index kinds is being read, so it waits for the view.
    assertSimDynamoDbConsistentReadAnswerable(input, view);
    select.assertAnswerableBy(view);
    expressions.filter?.assertNamesOnlyCarried(view);
    expressions.projection?.assertNamesOnlyCarried(view);

    // The token names a place in this view's scan order, so it can only be
    // checked once that order is known.
    const after = readSimDynamoDbScanStartKey({
      view,
      scan,
      segment,
      exclusiveStartKey: input.ExclusiveStartKey,
    });

    const page = new SimDynamoDbItemPage({
      items: scan.walk({ segment, after }),
      limit: input.Limit,
      view,
    });

    return {
      ...new SimDynamoDbReadAnswer({
        page,
        filter: expressions.filter,
        projection: expressions.projection,
        select,
        view,
      }).fields(),
      $metadata: {},
    };
  }
}
