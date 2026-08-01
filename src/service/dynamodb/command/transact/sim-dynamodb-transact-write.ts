import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import {
  readSimDynamoDbTransactConditionCheck,
  readSimDynamoDbTransactDelete,
} from "./sim-dynamodb-transact-key-actions.js";
import { readSimDynamoDbTransactPut } from "./sim-dynamodb-transact-put-action.js";
import { readSimDynamoDbTransactUpdate } from "./sim-dynamodb-transact-update-action.js";
import type { SimDynamoDbTransactWriteItem } from "./transact.command.js";

/**
 * One action of a transactional write.
 *
 * Every action knows the table it names, the IAM action it asks for, which item
 * of that table it works on, what has to hold for it, and what it does. Keeping
 * all of that here is what lets a transaction check every action before it
 * applies any of them, since the check and the write read the same item.
 */
export interface SimDynamoDbTransactWrite {
  /**
   * The table name or ARN this action names.
   */
  readonly reference: string | undefined;

  /**
   * The IAM action this one asks for.
   *
   * A transaction is authorized as the operations it is made of rather than as
   * itself, so a put in a transaction needs `dynamodb:PutItem` and a condition
   * check needs `dynamodb:ConditionCheckItem`.
   */
  readonly action: string;

  /**
   * The bytes this action counts towards the size of the transaction.
   */
  sizeInBytes(): number;

  /**
   * The primary key this action works on, as the table marshals it.
   */
  keyIn(table: SimDynamoDbTable): string;

  /**
   * Refuse this action against the table it names, before anything is written.
   *
   * A condition that does not hold throws
   * `SimDynamoDbConditionalCheckFailedException`, which the transaction turns
   * into the cancellation reason for this action. Anything else the action asks
   * for and the table will not take is a `SimDynamoDbValidationException`, which
   * refuses the whole request rather than cancelling it.
   */
  assertApplicableTo(table: SimDynamoDbTable): void;

  /**
   * Apply this action to the table.
   */
  applyTo(table: SimDynamoDbTable): void;
}

/**
 * One entry of a transactional write, and how to read it.
 */
interface SimDynamoDbTransactWriteReader {
  readonly name: string;
  read(): SimDynamoDbTransactWrite;
}

/**
 * Read one entry of a transactional write.
 *
 * A TransactWriteItem carries exactly one of Put, Update, Delete and
 * ConditionCheck. Both or neither is refused rather than guessed at, since
 * either guess would write something the request did not ask for.
 */
export function readSimDynamoDbTransactWrite(
  item: SimDynamoDbTransactWriteItem,
): SimDynamoDbTransactWrite {
  const readers = readersOf(item);
  const [only] = readers;

  if (only === undefined) {
    throw new SimDynamoDbValidationException(
      "A TransactWriteItem carries exactly one of Put, Update, Delete and " +
        "ConditionCheck, and this one carries none of them",
    );
  }

  if (readers.length > 1) {
    throw new SimDynamoDbValidationException(
      "A TransactWriteItem carries exactly one of Put, Update, Delete and " +
        `ConditionCheck, and this one carries ${readers
          .map((reader) => reader.name)
          .join(" and ")}`,
    );
  }

  return only.read();
}

/**
 * The actions one entry carries, in the order the request declares them.
 *
 * Nothing is read here beyond which of the four are there, so an entry carrying
 * two of them is told that rather than told what is wrong inside the first one.
 */
function readersOf(
  item: SimDynamoDbTransactWriteItem,
): readonly SimDynamoDbTransactWriteReader[] {
  const {
    Put: put,
    Update: update,
    Delete: remove,
    ConditionCheck: check,
  } = item;
  const readers: SimDynamoDbTransactWriteReader[] = [];

  if (put !== undefined) {
    readers.push({
      name: "Put",
      read: (): SimDynamoDbTransactWrite => readSimDynamoDbTransactPut(put),
    });
  }

  if (update !== undefined) {
    readers.push({
      name: "Update",
      read: (): SimDynamoDbTransactWrite =>
        readSimDynamoDbTransactUpdate(update),
    });
  }

  if (remove !== undefined) {
    readers.push({
      name: "Delete",
      read: (): SimDynamoDbTransactWrite =>
        readSimDynamoDbTransactDelete(remove),
    });
  }

  if (check !== undefined) {
    readers.push({
      name: "ConditionCheck",
      read: (): SimDynamoDbTransactWrite =>
        readSimDynamoDbTransactConditionCheck(check),
    });
  }

  return readers;
}
