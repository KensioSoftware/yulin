import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimDynamoDbTableUpdate } from "../../table/sim-dynamodb-table-update.js";
import type { SimDynamoDbTableAccess } from "./sim-dynamodb-table-access.js";
import { refuseUnsimulatedUpdateInput } from "./sim-dynamodb-unsimulated-update-input.js";
import type {
  SimUpdateTableCommand,
  SimUpdateTableCommandOutput,
} from "./table.command.js";

interface SimDynamoDbUpdateTableProperties {
  readonly access: SimDynamoDbTableAccess;
  readonly background: BackgroundScheduler;
}

interface SimDynamoDbUpdateTableOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The UpdateTable command.
 *
 * This is where a table's definition changes after it exists: what it is billed
 * and provisioned as, which global secondary indexes it carries, its class and
 * whether it is protected from deletion. AWS takes one of the first three per
 * call, and so does this.
 *
 * The table goes to UPDATING at once and back to ACTIVE once the scheduled work
 * has run, which is the sequence real DynamoDB goes through. It serves reads and
 * writes throughout, since AWS does not take a table offline to update it.
 */
export class SimDynamoDbUpdateTable {
  private readonly access: SimDynamoDbTableAccess;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimDynamoDbUpdateTableProperties) {
    this.access = properties.access;
    this.background = properties.background;
  }

  /**
   * Update a table, and describe it as it is being updated.
   *
   * The whole command runs in one turn. The request is read and checked against
   * the table before anything about the table changes, so a request that is
   * refused leaves the table exactly as it was.
   */
  handle(
    command: SimUpdateTableCommand,
    options?: SimDynamoDbUpdateTableOptions,
  ): SimUpdateTableCommandOutput {
    const input = command.input;

    refuseUnsimulatedUpdateInput(input);

    const table = this.access.required(
      "dynamodb:UpdateTable",
      input.TableName,
      options?.caller,
    );

    table.assertUpdatable();
    table.applyUpdate(SimDynamoDbTableUpdate.fromInput(input, table));
    this.background.schedule(() => table.activate());

    return { TableDescription: table.toDescription(), $metadata: {} };
  }
}
