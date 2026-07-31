import {
  SimDynamoDbConditionalCheckFailedException,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import { readSimDynamoDbCondition } from "../../expression/condition/sim-dynamodb-condition-expression.js";
import type { SimDynamoDbCondition } from "../../expression/condition/sim-dynamodb-condition.js";
import { SimDynamoDbConditionSubject } from "../../expression/condition/sim-dynamodb-condition-subject.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbAttributeValue } from "./item.types.js";

/**
 * What a request can ask to be given back when its condition turns it away.
 */
const failureModes: ReadonlySet<string> = new Set(["NONE", "ALL_OLD"]);

interface SimDynamoDbConditionCheckInput {
  readonly ConditionExpression?: string | undefined;
  readonly ExpressionAttributeNames?:
    Readonly<Record<string, string>> | undefined;
  readonly ExpressionAttributeValues?:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
  readonly ReturnValuesOnConditionCheckFailure?: string | undefined;
}

interface SimDynamoDbConditionCheckProperties {
  readonly condition: SimDynamoDbCondition | undefined;
  readonly reportsItem: boolean;
}

/**
 * The condition a write is guarded by, and what happens when it does not hold.
 *
 * PutItem and DeleteItem guard a write the same way, so they check it the same
 * way. The check is against whatever is stored under the key already, which may
 * be nothing: that is what makes `attribute_not_exists` an insert if absent.
 */
export class SimDynamoDbConditionCheck {
  private readonly condition: SimDynamoDbCondition | undefined;
  private readonly reportsItem: boolean;

  private constructor(properties: SimDynamoDbConditionCheckProperties) {
    this.condition = properties.condition;
    this.reportsItem = properties.reportsItem;
  }

  /**
   * Read the condition a request carries, before anything is looked up.
   *
   * An expression DynamoDB would refuse is refused whether or not the key holds
   * anything, so a bad expression fails the same way every time.
   */
  static read(
    input: SimDynamoDbConditionCheckInput,
    operation: string,
  ): SimDynamoDbConditionCheck {
    return new this({
      condition: readSimDynamoDbCondition(input),
      reportsItem: this.reportsItemFor(input, operation),
    });
  }

  /**
   * Whether the request asked for the item that turned it away.
   */
  private static reportsItemFor(
    input: SimDynamoDbConditionCheckInput,
    operation: string,
  ): boolean {
    const asked = input.ReturnValuesOnConditionCheckFailure;

    if (asked === undefined) {
      return false;
    }

    if (!failureModes.has(asked)) {
      throw new SimDynamoDbValidationException(
        `ReturnValuesOnConditionCheckFailure set to invalid value: ${asked}. ` +
          `${operation} takes NONE or ALL_OLD.`,
      );
    }

    return asked === "ALL_OLD";
  }

  /**
   * Refuse the write when the condition does not hold for what is stored.
   *
   * Nothing has changed by the time this throws, so the item is left exactly as
   * it was.
   */
  assertHoldsFor(existing: SimDynamoDbItem | undefined): void {
    if (this.condition === undefined) {
      return;
    }

    if (this.condition.holdsFor(new SimDynamoDbConditionSubject(existing))) {
      return;
    }

    throw new SimDynamoDbConditionalCheckFailedException(
      this.reportedItem(existing),
    );
  }

  /**
   * The item the failure carries, when the request asked for it and there was
   * one.
   */
  private reportedItem(
    existing: SimDynamoDbItem | undefined,
  ): Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined {
    if (!this.reportsItem) {
      return undefined;
    }

    return existing?.toAttributeValues();
  }
}
