import type {
  SimDynamoDbAttributeValue,
  SimDynamoDbAttributeValueUpdate,
} from "../../command/item/item.types.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { readSimDynamoDbValue } from "../../item/sim-dynamodb-value-reader.js";
import type { SimDynamoDbLegacyPlaceholders } from "./sim-dynamodb-legacy-placeholders.js";
import { isOneOf } from "../../../../util/type-guard/one-of.js";

/**
 * The clause each legacy action is written into.
 */
const clauses = ["SET", "REMOVE", "ADD", "DELETE"] as const;

type SimDynamoDbLegacyClause = (typeof clauses)[number];

const setKinds: ReadonlySet<string> = new Set(["SS", "NS", "BS"]);
const addKinds: ReadonlySet<string> = new Set(["N", "SS", "NS", "BS"]);

/**
 * Write an `AttributeUpdates` parameter as the update expression it stands for.
 *
 * `PUT` sets an attribute. `DELETE` removes one, or takes members out of a set
 * when it carries a value. `ADD` adds to a number or a set. Each is checked
 * here, so a change AWS would refuse is refused for what the parameter said.
 */
export function simDynamoDbLegacyUpdate(
  updates: Readonly<Record<string, SimDynamoDbAttributeValueUpdate>>,
  placeholders: SimDynamoDbLegacyPlaceholders,
): string | undefined {
  const written = new Map<SimDynamoDbLegacyClause, string[]>();

  for (const [attribute, update] of Object.entries(updates)) {
    const action = update.Action ?? "PUT";
    const clause = clauseOf(attribute, action, update.Value);
    const name = placeholders.name(attribute);
    const entry =
      update.Value === undefined
        ? name
        : `${name}${clause === "SET" ? " =" : ""} ${placeholders.value(update.Value)}`;

    written.set(clause, [...(written.get(clause) ?? []), entry]);
  }

  const expression = clauses
    .filter((clause) => written.has(clause))
    .map((clause) => `${clause} ${(written.get(clause) ?? []).join(", ")}`)
    .join(" ");

  return expression === "" ? undefined : expression;
}

/**
 * Whether an update creates an item under a key that holds none.
 *
 * Every update does except one made only of `DELETE` actions. AWS documents
 * that one as succeeding while leaving the key empty, since there is nothing
 * to delete from.
 */
export function simDynamoDbLegacyUpdateCreatesItem(
  updates:
    | Readonly<Record<string, SimDynamoDbAttributeValueUpdate>>
    | undefined,
): boolean {
  const actions = Object.values(updates ?? {}).map(
    (update) => update.Action ?? "PUT",
  );

  return actions.length === 0 || actions.some((action) => action !== "DELETE");
}

/**
 * The clause one action is written into, refusing an action AWS refuses.
 */
function clauseOf(
  attribute: string,
  action: string,
  value: SimDynamoDbAttributeValue | undefined,
): SimDynamoDbLegacyClause {
  if (!isOneOf(["PUT", "DELETE", "ADD"], action)) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: Action '${action}' for ` +
        `${attribute} is not one of PUT, DELETE, ADD`,
    );
  }

  if (value === undefined) {
    if (action !== "DELETE") {
      throw new SimDynamoDbValidationException(
        `One or more parameter values were invalid: Only DELETE action is ` +
          `allowed when no attribute value is specified`,
      );
    }

    return "REMOVE";
  }

  if (action === "PUT") {
    return "SET";
  }

  assertKind(action, action === "ADD" ? addKinds : setKinds, value);

  return action;
}

/**
 * Refuse a value of a type the action cannot apply.
 */
function assertKind(
  action: string,
  kinds: ReadonlySet<string>,
  value: SimDynamoDbAttributeValue,
): void {
  const kind = readSimDynamoDbValue(value).kind;

  if (!kinds.has(kind)) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: ${action} action ` +
        `with value is not supported for the type ${kind}`,
    );
  }
}
