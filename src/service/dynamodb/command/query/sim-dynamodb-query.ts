import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimDynamoDbItemPage } from "../item/sim-dynamodb-item-page.js";
import { SimDynamoDbReadAnswer } from "../read/sim-dynamodb-read-answer.js";
import { refuseSimDynamoDbConsistentIndexRead } from "../read/sim-dynamodb-consistent-read.js";
import { SimDynamoDbSelect } from "../read/sim-dynamodb-select.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import type {
  SimQueryCommand,
  SimQueryCommandOutput,
} from "./query.command.js";
import { readSimDynamoDbQueryExpressions } from "./sim-dynamodb-query-expressions.js";
import { refuseSimDynamoDbQuerySegment } from "./sim-dynamodb-query-segment.js";
import { readSimDynamoDbQueryStartKey } from "./sim-dynamodb-query-start-key.js";
import { refuseUnsimulatedQueryInput } from "./sim-dynamodb-unsimulated-query-input.js";

interface SimDynamoDbQueryProperties {
  readonly access: SimDynamoDbTableAccess;
}

interface SimDynamoDbQueryOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The Query command.
 *
 * A query reads one item collection: the items under one partition key, in sort
 * key order. That is the whole of it, and it is why the key condition is a
 * closed grammar rather than the general condition grammar.
 */
export class SimDynamoDbQuery {
  private readonly access: SimDynamoDbTableAccess;

  constructor(properties: SimDynamoDbQueryProperties) {
    this.access = properties.access;
  }

  /**
   * Read a page of the item collection a key condition names.
   */
  handle(
    command: SimQueryCommand,
    options?: SimDynamoDbQueryOptions,
  ): SimQueryCommandOutput {
    const input = command.input;

    // Which attributes the request asks for is read first, since it decides
    // whether the projection the request carries is one it could have asked
    // for at all.
    const select = SimDynamoDbSelect.from(input);

    refuseUnsimulatedQueryInput(input);
    refuseSimDynamoDbQuerySegment(input);

    refuseSimDynamoDbConsistentIndexRead(input);

    const expressions = readSimDynamoDbQueryExpressions(input);
    const table = this.access.required(
      "dynamodb:Query",
      input.TableName,
      options?.caller,
    );

    // What is being read is settled here: the table, or one of its indexes. An
    // IndexName the table does not have is refused rather than read as the
    // table. Everything after this asks the view rather than the table, so a
    // query of an index is the same query against a narrower thing.
    const view = table.view(input.IndexName);
    const keyCondition = expressions.terms.forTable(view);

    select.assertAnswerableBy(view);

    // A query has narrowed the read by its key condition already, so a filter
    // naming a key attribute is refused. That needs the key schema, so it
    // waits for the view the same way the key condition does.
    expressions.filter?.assertNamesNoKeyAttribute(view.keySchema);
    expressions.filter?.assertNamesOnlyCarried(view);

    // The token names an item of the collection being read, so it can only be
    // checked once that collection is known.
    const after = readSimDynamoDbQueryStartKey({
      view,
      keyCondition,
      exclusiveStartKey: input.ExclusiveStartKey,
    });

    const page = new SimDynamoDbItemPage({
      items: view.itemCollection(keyCondition).walk({
        forward: input.ScanIndexForward ?? true,
        after,
      }),
      limit: input.Limit,
      view,
    });

    return {
      ...new SimDynamoDbReadAnswer({
        page,
        filter: expressions.filter,
        select,
        view,
      }).fields(),
      $metadata: {},
    };
  }
}
