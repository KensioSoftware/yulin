import {
  isSimDynamoDbSet,
  type SimDynamoDbSetValue,
  simDynamoDbSetUnion,
} from "../../item/sim-dynamodb-set-members.js";
import type {
  SimDynamoDbNumberValue,
  SimDynamoDbValue,
} from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbItemSnapshot } from "../sim-dynamodb-item-snapshot.js";
import type { SimDynamoDbUpdateAction } from "./sim-dynamodb-update-action.js";
import {
  simDynamoDbAppliedSets,
  simDynamoDbIncorrectOperand,
  simDynamoDbStoredMismatch,
} from "./sim-dynamodb-update-accumulate-values.js";
import type { SimDynamoDbUpdateDocument } from "./sim-dynamodb-update-document.js";
import type { SimDynamoDbUpdateValueOperand } from "./sim-dynamodb-update-operand.js";
import type { SimDynamoDbUpdateTarget } from "./sim-dynamodb-update-target.js";

/**
 * `ADD path :value`, which adds to what an attribute already holds rather than
 * replacing it.
 *
 * A number is added mathematically, and an attribute that is not there counts
 * as zero, so a negative value counts down. A set is unioned with the stored
 * one, and an attribute that is not there becomes the set the request carried.
 *
 * Real DynamoDB takes ADD on a Number or a set and nothing else. AWS recommends
 * SET over ADD for a number, since a retried ADD counts twice where a retried
 * SET writes the same value again.
 */
export class SimDynamoDbAddAction implements SimDynamoDbUpdateAction {
  public readonly target: SimDynamoDbUpdateTarget;
  public readonly verb = "update";
  public readonly closesUpLists = false;

  private readonly operand: SimDynamoDbUpdateValueOperand;

  constructor(
    target: SimDynamoDbUpdateTarget,
    operand: SimDynamoDbUpdateValueOperand,
  ) {
    this.target = target;
    this.operand = operand;
  }

  /**
   * Add the value to what the attribute holds, or write it where the attribute
   * was not there at all.
   */
  applyTo(
    document: SimDynamoDbUpdateDocument,
    snapshot: SimDynamoDbItemSnapshot,
  ): void {
    document.set(this.target, this.total(snapshot.valueAt(this.target.path)));
  }

  /**
   * What the attribute holds once the value has been added to it.
   */
  private total(stored: SimDynamoDbValue | undefined): SimDynamoDbValue {
    const added = this.operand.value;

    if (added.kind === "N") {
      return this.sum(stored, added);
    }

    if (isSimDynamoDbSet(added)) {
      return this.union(stored, added);
    }

    throw simDynamoDbIncorrectOperand("ADD", added.kind, this.operand.text);
  }

  /**
   * The stored number with the value added to it, where an attribute that is
   * not there counts as zero.
   */
  private sum(
    stored: SimDynamoDbValue | undefined,
    added: SimDynamoDbNumberValue,
  ): SimDynamoDbValue {
    if (stored === undefined) {
      return added;
    }

    if (stored.kind !== "N") {
      throw simDynamoDbStoredMismatch(
        "ADD",
        stored.kind,
        added.kind,
        this.target.text,
      );
    }

    return { kind: "N", number: stored.number.plus(added.number) };
  }

  /**
   * The stored set with the value's members added to it.
   */
  private union(
    stored: SimDynamoDbValue | undefined,
    added: SimDynamoDbSetValue,
  ): SimDynamoDbValue {
    if (stored === undefined) {
      return added;
    }

    return simDynamoDbSetUnion(
      simDynamoDbAppliedSets(stored, added, "ADD", this.target.text),
    );
  }
}
