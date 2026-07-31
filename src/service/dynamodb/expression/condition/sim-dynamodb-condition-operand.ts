import { SimDynamoDbNumber } from "../../item/sim-dynamodb-number.js";
import { simDynamoDbTextSize } from "../../item/sim-dynamodb-value-size.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbDocumentPath } from "../sim-dynamodb-document-path.js";
import type { SimDynamoDbItemSnapshot } from "../sim-dynamodb-item-snapshot.js";

/**
 * One side of a comparison in a condition expression.
 *
 * An operand answers with a value for the item being checked, or with nothing
 * when the item does not have what it points at. Nothing compares to nothing,
 * so an absent operand makes its comparison false rather than failing it.
 */
export interface SimDynamoDbConditionOperand {
  /**
   * How the expression wrote this operand, for a refusal to name.
   */
  readonly text: string;

  /**
   * What this operand names, as text no other operand can produce. Two
   * operands are the same operand when their identities match.
   */
  readonly identity: string;

  /**
   * The value this operand has for an item, if it has one.
   */
  valueIn(subject: SimDynamoDbItemSnapshot): SimDynamoDbValue | undefined;
}

/**
 * An operand naming a place in the item.
 */
export class SimDynamoDbPathOperand implements SimDynamoDbConditionOperand {
  public readonly path: SimDynamoDbDocumentPath;

  constructor(path: SimDynamoDbDocumentPath) {
    this.path = path;
  }

  get text(): string {
    return this.path.text;
  }

  get identity(): string {
    return this.path.identity;
  }

  valueIn(subject: SimDynamoDbItemSnapshot): SimDynamoDbValue | undefined {
    return subject.valueAt(this.path);
  }
}

/**
 * An operand carrying a value the request supplied, through
 * ExpressionAttributeValues.
 *
 * The value is the same whatever item is being checked, so nothing is looked
 * up for it.
 */
export class SimDynamoDbValueOperand implements SimDynamoDbConditionOperand {
  public readonly text: string;
  public readonly value: SimDynamoDbValue;

  constructor(text: string, value: SimDynamoDbValue) {
    this.text = text;
    this.value = value;
  }

  /**
   * A placeholder names itself, and no path can be written to look like one.
   */
  get identity(): string {
    return this.text;
  }

  valueIn(): SimDynamoDbValue {
    return this.value;
  }
}

/**
 * An operand giving the size of what a path points at.
 *
 * `size` is a number, so it compares against numbers. A string and binary
 * measure in bytes, and a set, a list or a map in how many things it holds. A
 * number, a boolean and a null have no size, so a comparison against one is
 * false rather than an error.
 */
export class SimDynamoDbSizeOperand implements SimDynamoDbConditionOperand {
  private readonly operand: SimDynamoDbPathOperand;

  constructor(operand: SimDynamoDbPathOperand) {
    this.operand = operand;
  }

  get text(): string {
    return `size(${this.operand.text})`;
  }

  get identity(): string {
    return `size(${this.operand.identity})`;
  }

  valueIn(subject: SimDynamoDbItemSnapshot): SimDynamoDbValue | undefined {
    const value = this.operand.valueIn(subject);

    if (value === undefined) {
      return undefined;
    }

    const size = sizeOf(value);

    if (size === undefined) {
      return undefined;
    }

    return { kind: "N", number: SimDynamoDbNumber.of(size.toString()) };
  }
}

/**
 * How big a stored value is, in whatever unit DynamoDB measures its type in.
 */
function sizeOf(value: SimDynamoDbValue): number | undefined {
  switch (value.kind) {
    case "S": {
      return simDynamoDbTextSize(value.text);
    }
    case "B": {
      return value.bytes.byteLength;
    }
    case "SS": {
      return value.texts.length;
    }
    case "NS": {
      return value.numbers.length;
    }
    case "BS": {
      return value.bytes.length;
    }
    case "L": {
      return value.values.length;
    }
    case "M": {
      return value.entries.size;
    }
    case "N":
    case "BOOL":
    case "NULL": {
      return undefined;
    }
  }
}
