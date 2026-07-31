import {
  isSimDynamoDbSet,
  type SimDynamoDbSetValue,
  simDynamoDbSetDifference,
} from "../../item/sim-dynamodb-set-members.js";
import type { SimDynamoDbItemSnapshot } from "../sim-dynamodb-item-snapshot.js";
import type { SimDynamoDbUpdateAction } from "./sim-dynamodb-update-action.js";
import {
  simDynamoDbAppliedSets,
  simDynamoDbIncorrectOperand,
} from "./sim-dynamodb-update-accumulate-values.js";
import type { SimDynamoDbUpdateDocument } from "./sim-dynamodb-update-document.js";
import type { SimDynamoDbUpdateValueOperand } from "./sim-dynamodb-update-operand.js";
import type { SimDynamoDbUpdateTarget } from "./sim-dynamodb-update-target.js";

/**
 * `DELETE path :value`, which takes members out of a stored set.
 *
 * It is set subtraction and nothing else, so the value has to be a set of the
 * kind the attribute holds. A member the set does not hold is not an error, and
 * a subtraction that empties the set takes the attribute away with it, since
 * DynamoDB has no empty set.
 */
export class SimDynamoDbDeleteAction implements SimDynamoDbUpdateAction {
  public readonly target: SimDynamoDbUpdateTarget;
  public readonly verb = "remove";
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
   * Take the members out of the stored set, if the attribute is there at all.
   */
  applyTo(
    document: SimDynamoDbUpdateDocument,
    snapshot: SimDynamoDbItemSnapshot,
  ): void {
    const removed = this.removedMembers();
    const stored = snapshot.valueAt(this.target.path);

    if (stored === undefined) {
      return;
    }

    const kept = simDynamoDbSetDifference(
      simDynamoDbAppliedSets(stored, removed, "DELETE", this.target.text),
    );

    if (kept === undefined) {
      document.remove(this.target);

      return;
    }

    document.set(this.target, kept);
  }

  /**
   * The set of members this action takes away.
   */
  private removedMembers(): SimDynamoDbSetValue {
    const removed = this.operand.value;

    if (!isSimDynamoDbSet(removed)) {
      throw simDynamoDbIncorrectOperand(
        "DELETE",
        removed.kind,
        this.operand.text,
      );
    }

    return removed;
  }
}
