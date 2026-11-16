import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import {
  readSimDynamoDbTransactConditionCheck,
  readSimDynamoDbTransactDelete,
} from "./sim-dynamodb-transact-key-actions.js";
import { readSimDynamoDbTransactPut } from "./sim-dynamodb-transact-put-action.js";
import { readSimDynamoDbTransactUpdate } from "./sim-dynamodb-transact-update-action.js";
import type { SimDynamoDbTransactWrite } from "./sim-dynamodb-transact-write.types.js";
import type { SimDynamoDbTransactWriteItem } from "./transact.command.js";

export type { SimDynamoDbTransactWrite } from "./sim-dynamodb-transact-write.types.js";

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
  const readers: SimDynamoDbTransactWriteReader[] = [
    ...(put === undefined
      ? []
      : [
          {
            name: "Put",
            read: (): SimDynamoDbTransactWrite =>
              readSimDynamoDbTransactPut(put),
          },
        ]),
    ...(update === undefined
      ? []
      : [
          {
            name: "Update",
            read: (): SimDynamoDbTransactWrite =>
              readSimDynamoDbTransactUpdate(update),
          },
        ]),
    ...(remove === undefined
      ? []
      : [
          {
            name: "Delete",
            read: (): SimDynamoDbTransactWrite =>
              readSimDynamoDbTransactDelete(remove),
          },
        ]),
    ...(check === undefined
      ? []
      : [
          {
            name: "ConditionCheck",
            read: (): SimDynamoDbTransactWrite =>
              readSimDynamoDbTransactConditionCheck(check),
          },
        ]),
  ];

  return readers;
}
