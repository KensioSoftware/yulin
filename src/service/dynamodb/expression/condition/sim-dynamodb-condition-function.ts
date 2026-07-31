import { simDynamoDbValuesEqual } from "../../item/sim-dynamodb-value-comparison.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbCondition } from "./sim-dynamodb-condition.js";
import type {
  SimDynamoDbConditionOperand,
  SimDynamoDbPathOperand,
} from "./sim-dynamodb-condition-operand.js";
import type { SimDynamoDbConditionSubject } from "./sim-dynamodb-condition-subject.js";

/**
 * Whether an item has the attribute a path names.
 *
 * An attribute stored as NULL exists. NULL is a value in DynamoDB rather than
 * an absent one, so an item carrying it has the attribute.
 */
export class SimDynamoDbAttributeExistsCondition implements SimDynamoDbCondition {
  private readonly operand: SimDynamoDbPathOperand;
  private readonly wanted: boolean;

  constructor(operand: SimDynamoDbPathOperand, wanted: boolean) {
    this.operand = operand;
    this.wanted = wanted;
  }

  /**
   * Whether the item has the attribute, or does not, as the function asked.
   */
  holdsFor(subject: SimDynamoDbConditionSubject): boolean {
    return (this.operand.valueIn(subject) !== undefined) === this.wanted;
  }
}

/**
 * Whether what a path names is of a type.
 *
 * The type is one of the descriptors an AttributeValue carries, given as a
 * string through ExpressionAttributeValues.
 */
export class SimDynamoDbAttributeTypeCondition implements SimDynamoDbCondition {
  private readonly operand: SimDynamoDbPathOperand;
  private readonly type: string;

  constructor(operand: SimDynamoDbPathOperand, type: string) {
    this.operand = operand;
    this.type = type;
  }

  /**
   * Whether what the path names is stored under the descriptor asked about.
   */
  holdsFor(subject: SimDynamoDbConditionSubject): boolean {
    return this.operand.valueIn(subject)?.kind === this.type;
  }
}

/**
 * Whether a string or some binary starts with another.
 *
 * Two operands of different types never match, so a string never begins with
 * binary however the bytes line up.
 */
export class SimDynamoDbBeginsWithCondition implements SimDynamoDbCondition {
  private readonly operand: SimDynamoDbConditionOperand;
  private readonly prefix: SimDynamoDbConditionOperand;

  constructor(
    operand: SimDynamoDbConditionOperand,
    prefix: SimDynamoDbConditionOperand,
  ) {
    this.operand = operand;
    this.prefix = prefix;
  }

  /**
   * Whether what the path names starts with the prefix.
   */
  holdsFor(subject: SimDynamoDbConditionSubject): boolean {
    const value = this.operand.valueIn(subject);
    const prefix = this.prefix.valueIn(subject);

    if (value === undefined || prefix === undefined) {
      return false;
    }

    if (value.kind === "S" && prefix.kind === "S") {
      return value.text.startsWith(prefix.text);
    }

    if (value.kind === "B" && prefix.kind === "B") {
      return beginsWithBytes(value.bytes, prefix.bytes);
    }

    return false;
  }
}

/**
 * Whether some bytes start with some other bytes.
 */
function beginsWithBytes(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (prefix.length > bytes.length) {
    return false;
  }

  return prefix.every((byte, at) => bytes.at(at) === byte);
}

/**
 * Whether a string holds a substring, or a set or a list holds a member.
 */
export class SimDynamoDbContainsCondition implements SimDynamoDbCondition {
  private readonly operand: SimDynamoDbConditionOperand;
  private readonly sought: SimDynamoDbConditionOperand;

  constructor(
    operand: SimDynamoDbConditionOperand,
    sought: SimDynamoDbConditionOperand,
  ) {
    this.operand = operand;
    this.sought = sought;
  }

  /**
   * Whether what the path names holds what was sought.
   */
  holdsFor(subject: SimDynamoDbConditionSubject): boolean {
    const value = this.operand.valueIn(subject);
    const sought = this.sought.valueIn(subject);

    if (value === undefined || sought === undefined) {
      return false;
    }

    if (value.kind === "S" && sought.kind === "S") {
      return value.text.includes(sought.text);
    }

    return membersOf(value).some((member) =>
      simDynamoDbValuesEqual(member, sought),
    );
  }
}

/**
 * The things a set or a list holds, as values to compare against.
 *
 * Anything else holds no members, so `contains` over it is false.
 */
function membersOf(value: SimDynamoDbValue): readonly SimDynamoDbValue[] {
  switch (value.kind) {
    case "SS": {
      return value.texts.map((text) => ({ kind: "S", text }));
    }
    case "NS": {
      return value.numbers.map((number) => ({ kind: "N", number }));
    }
    case "BS": {
      return value.bytes.map((bytes) => ({ kind: "B", bytes }));
    }
    case "L": {
      return value.values;
    }
    case "S":
    case "N":
    case "B":
    case "BOOL":
    case "NULL":
    case "M": {
      return [];
    }
  }
}
