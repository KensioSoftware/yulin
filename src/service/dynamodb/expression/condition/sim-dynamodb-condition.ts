import type { SimDynamoDbItemSnapshot } from "../sim-dynamodb-item-snapshot.js";

/**
 * One condition a write is guarded by.
 *
 * A condition answers yes or no for the item that is stored, and never
 * anything else: DynamoDB has no third answer for a path an item does not
 * have. Whatever cannot be decided is false, so a write goes through only when
 * the condition it named actually held.
 */
export interface SimDynamoDbCondition {
  holdsFor(subject: SimDynamoDbItemSnapshot): boolean;
}

/**
 * Two conditions that both have to hold.
 */
export class SimDynamoDbAndCondition implements SimDynamoDbCondition {
  private readonly left: SimDynamoDbCondition;
  private readonly right: SimDynamoDbCondition;

  constructor(left: SimDynamoDbCondition, right: SimDynamoDbCondition) {
    this.left = left;
    this.right = right;
  }

  /**
   * Whether both sides hold for an item.
   */
  holdsFor(subject: SimDynamoDbItemSnapshot): boolean {
    return this.left.holdsFor(subject) && this.right.holdsFor(subject);
  }
}

/**
 * Two conditions where either holding is enough.
 */
export class SimDynamoDbOrCondition implements SimDynamoDbCondition {
  private readonly left: SimDynamoDbCondition;
  private readonly right: SimDynamoDbCondition;

  constructor(left: SimDynamoDbCondition, right: SimDynamoDbCondition) {
    this.left = left;
    this.right = right;
  }

  /**
   * Whether either side holds for an item.
   */
  holdsFor(subject: SimDynamoDbItemSnapshot): boolean {
    return this.left.holdsFor(subject) || this.right.holdsFor(subject);
  }
}

/**
 * A condition that has to not hold.
 */
export class SimDynamoDbNotCondition implements SimDynamoDbCondition {
  private readonly condition: SimDynamoDbCondition;

  constructor(condition: SimDynamoDbCondition) {
    this.condition = condition;
  }

  /**
   * Whether the condition inside does not hold for an item.
   */
  holdsFor(subject: SimDynamoDbItemSnapshot): boolean {
    return !this.condition.holdsFor(subject);
  }
}
