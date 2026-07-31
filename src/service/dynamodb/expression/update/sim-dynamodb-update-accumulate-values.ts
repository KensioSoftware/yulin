import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import {
  isSimDynamoDbSet,
  type SimDynamoDbSetPair,
  type SimDynamoDbSetValue,
  simDynamoDbMatchingSets,
} from "../../item/sim-dynamodb-set-members.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import { simDynamoDbUpdateError } from "./sim-dynamodb-update-refusal.js";

/**
 * The stored value and the value being applied, as two sets of one kind.
 *
 * ADD and DELETE both work from what an attribute already holds, and both are
 * refused the same way when the two do not go together.
 */
export function simDynamoDbAppliedSets(
  stored: SimDynamoDbValue,
  applied: SimDynamoDbSetValue,
  clause: string,
  path: string,
): SimDynamoDbSetPair {
  const pair = pairedSets(stored, applied);

  if (pair === undefined) {
    throw simDynamoDbStoredMismatch(clause, stored.kind, applied.kind, path);
  }

  return pair;
}

/**
 * Refuse a value of a type the clause has no meaning for.
 */
export function simDynamoDbIncorrectOperand(
  clause: string,
  kind: string,
  text: string,
): SimDynamoDbValidationException {
  return simDynamoDbUpdateError(
    `Incorrect operand type for operator or function; operator: ${clause}, ` +
      `operand type: ${kind}, in '${text}'`,
  );
}

/**
 * Refuse a value that does not go with what the attribute already holds.
 */
export function simDynamoDbStoredMismatch(
  clause: string,
  storedKind: string,
  appliedKind: string,
  path: string,
): SimDynamoDbValidationException {
  return new SimDynamoDbValidationException(
    `An operand in the update expression has an incorrect data type: ` +
      `${clause} cannot apply a ${appliedKind} to the ${storedKind} stored ` +
      `at '${path}'`,
  );
}

/**
 * The two values paired up, when the stored one is a set of the same kind.
 */
function pairedSets(
  stored: SimDynamoDbValue,
  applied: SimDynamoDbSetValue,
): SimDynamoDbSetPair | undefined {
  if (!isSimDynamoDbSet(stored)) {
    return undefined;
  }

  return simDynamoDbMatchingSets(stored, applied);
}
