import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbItemSnapshot } from "../sim-dynamodb-item-snapshot.js";
import type { SimDynamoDbUpdateDocument } from "./sim-dynamodb-update-document.js";
import type { SimDynamoDbUpdateOperand } from "./sim-dynamodb-update-operand.js";
import type { SimDynamoDbUpdateTarget } from "./sim-dynamodb-update-target.js";

/**
 * One thing an update expression does to an item.
 *
 * Every action reads the snapshot of the item as it stood before the update and
 * writes into the item being built, so the actions of one expression do not see
 * each other's work.
 */
export interface SimDynamoDbUpdateAction {
  /** Where in the item this action writes. */
  readonly target: SimDynamoDbUpdateTarget;

  /** What this action does, for a refusal to name. */
  readonly verb: string;

  applyTo(
    document: SimDynamoDbUpdateDocument,
    snapshot: SimDynamoDbItemSnapshot,
  ): void;
}

/**
 * `path = operand`, which writes a value where the path points.
 *
 * An operand pointing at an attribute the item does not have is refused rather
 * than treated as nothing, as real DynamoDB refuses it. `if_not_exists` is how
 * an expression says what to assign when the attribute may be absent.
 */
export class SimDynamoDbSetAction implements SimDynamoDbUpdateAction {
  public readonly target: SimDynamoDbUpdateTarget;
  public readonly verb = "update";

  private readonly operand: SimDynamoDbUpdateOperand;

  constructor(
    target: SimDynamoDbUpdateTarget,
    operand: SimDynamoDbUpdateOperand,
  ) {
    this.target = target;
    this.operand = operand;
  }

  /**
   * Write what the operand works out to, where the target points.
   */
  applyTo(
    document: SimDynamoDbUpdateDocument,
    snapshot: SimDynamoDbItemSnapshot,
  ): void {
    const value = this.operand.valueIn(snapshot);

    if (value === undefined) {
      throw new SimDynamoDbValidationException(
        `The provided expression refers to an attribute that does not exist ` +
          `in the item: '${this.operand.text}'`,
      );
    }

    document.set(this.target, value);
  }
}

/**
 * `path`, which takes away whatever the path points at.
 */
export class SimDynamoDbRemoveAction implements SimDynamoDbUpdateAction {
  public readonly target: SimDynamoDbUpdateTarget;
  public readonly verb = "remove";

  constructor(target: SimDynamoDbUpdateTarget) {
    this.target = target;
  }

  /**
   * Take away whatever the target points at.
   */
  applyTo(document: SimDynamoDbUpdateDocument): void {
    document.remove(this.target);
  }
}
