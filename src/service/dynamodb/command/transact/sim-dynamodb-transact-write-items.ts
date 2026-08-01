import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import { applySimDynamoDbTransaction } from "./sim-dynamodb-transact-cancellation.js";
import { reachSimDynamoDbTransactTables } from "./sim-dynamodb-transact-tables.js";
import { readSimDynamoDbTransactWrites } from "./sim-dynamodb-transact-writes.js";
import {
  readSimDynamoDbClientRequestToken,
  SimDynamoDbTransactionTokens,
  simDynamoDbTransactionPayload,
} from "./sim-dynamodb-transaction-tokens.js";
import { refuseUnsimulatedTransactWriteInput } from "./sim-dynamodb-unsimulated-transact-input.js";
import type {
  SimTransactWriteItemsCommand,
  SimTransactWriteItemsCommandOutput,
} from "./transact.command.js";

interface SimDynamoDbTransactWriteItemsProperties {
  readonly access: SimDynamoDbTableAccess;
  readonly clock: SimClock;
}

interface SimDynamoDbTransactWriteItemsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The TransactWriteItems command.
 *
 * A transaction puts, updates, deletes and condition checks items across tables
 * in one call, and either all of it happens or none of it does. Every action is
 * checked against what is stored before the first of them writes anything, so
 * atomicity here follows from the order the work is done in rather than from
 * unwinding a partial write.
 *
 * A failed condition cancels the whole transaction with
 * `TransactionCanceledException`, carrying one cancellation reason per action
 * in request order, including the actions that would have gone through.
 */
export class SimDynamoDbTransactWriteItems {
  private readonly access: SimDynamoDbTableAccess;
  private readonly tokens: SimDynamoDbTransactionTokens;

  constructor(properties: SimDynamoDbTransactWriteItemsProperties) {
    this.access = properties.access;
    this.tokens = new SimDynamoDbTransactionTokens({
      clock: properties.clock,
    });
  }

  /**
   * Apply every action a transaction asks for, or none of them.
   */
  handle(
    command: SimTransactWriteItemsCommand,
    options?: SimDynamoDbTransactWriteItemsOptions,
  ): SimTransactWriteItemsCommandOutput {
    const input = command.input;

    refuseUnsimulatedTransactWriteInput(input);

    const token = readSimDynamoDbClientRequestToken(input.ClientRequestToken);
    const payload = simDynamoDbTransactionPayload(input.TransactItems);
    const targets = reachSimDynamoDbTransactTables(
      readSimDynamoDbTransactWrites(input.TransactItems),
      { access: this.access, caller: options?.caller },
    );

    // A retry under a token this simulation has already applied writes nothing
    // again, which is what makes the retry idempotent. The request is still
    // read and the caller still authorized against every table it names, since
    // IAM evaluates a request before the service handles it.
    if (!this.tokens.isReplayOf(token, payload)) {
      applySimDynamoDbTransaction(targets);
      this.tokens.record(token, payload);
    }

    return { $metadata: {} };
  }
}
