import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import { SimDynamoDbConditionCheck } from "../item/sim-dynamodb-condition-check.js";
import { readSimDynamoDbKey } from "../item/sim-dynamodb-key-input.js";
import type { SimDynamoDbTransactWrite } from "./sim-dynamodb-transact-write.js";
import type {
  SimDynamoDbTransactConditionCheck,
  SimDynamoDbTransactDelete,
} from "./transact.command.js";

/**
 * An action of a transaction that names one item by its Key.
 *
 * A delete and a condition check are both a key and a condition against what is
 * stored under it. What they do once the condition holds is all that differs.
 */
abstract class SimDynamoDbTransactKeyAction implements SimDynamoDbTransactWrite {
  public abstract readonly action: string;
  public readonly reference: string | undefined;

  protected readonly key: SimDynamoDbItem;

  private readonly check: SimDynamoDbConditionCheck;

  constructor(
    reference: string | undefined,
    key: SimDynamoDbItem,
    check: SimDynamoDbConditionCheck,
  ) {
    this.reference = reference;
    this.key = key;
    this.check = check;
  }

  sizeInBytes(): number {
    return this.key.sizeInBytes();
  }

  keyIn(table: SimDynamoDbTable): string {
    return table.keyOfKey(this.key);
  }

  assertApplicableTo(table: SimDynamoDbTable): void {
    this.check.assertHoldsFor(table.getItem(this.key));
  }

  abstract applyTo(table: SimDynamoDbTable): void;
}

/**
 * A delete in a transaction, which names a key rather than an item, so a key
 * that is already free is deleted successfully.
 */
class SimDynamoDbTransactDeleteAction extends SimDynamoDbTransactKeyAction {
  public readonly action = "dynamodb:DeleteItem";

  applyTo(table: SimDynamoDbTable): void {
    table.deleteItem(this.key);
  }
}

/**
 * A condition check in a transaction, which writes nothing.
 *
 * It is how a transaction says that an item it is not changing has to hold for
 * the items it is changing to be written.
 */
class SimDynamoDbTransactConditionCheckAction extends SimDynamoDbTransactKeyAction {
  public readonly action = "dynamodb:ConditionCheckItem";

  applyTo(): void {
    // A condition check changes nothing. What it does happened when its
    // condition was checked against the item it names.
  }
}

/**
 * Read the Delete one action of a transaction carries.
 */
export function readSimDynamoDbTransactDelete(
  request: SimDynamoDbTransactDelete,
): SimDynamoDbTransactWrite {
  return new SimDynamoDbTransactDeleteAction(
    request.TableName,
    readSimDynamoDbKey(request.Key),
    SimDynamoDbConditionCheck.read(request, "TransactWriteItems"),
  );
}

/**
 * Read the ConditionCheck one action of a transaction carries.
 */
export function readSimDynamoDbTransactConditionCheck(
  request: SimDynamoDbTransactConditionCheck,
): SimDynamoDbTransactWrite {
  if (request.ConditionExpression === undefined) {
    throw new SimDynamoDbValidationException(
      "A ConditionCheck requires a ConditionExpression, which is the whole of " +
        "what it does",
    );
  }

  return new SimDynamoDbTransactConditionCheckAction(
    request.TableName,
    readSimDynamoDbKey(request.Key),
    SimDynamoDbConditionCheck.read(request, "TransactWriteItems"),
  );
}
