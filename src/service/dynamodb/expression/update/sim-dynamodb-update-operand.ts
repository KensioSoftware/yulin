import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbDocumentPath } from "../sim-dynamodb-document-path.js";
import type { SimDynamoDbItemSnapshot } from "../sim-dynamodb-item-snapshot.js";

/**
 * What a SET action assigns.
 *
 * An operand answers with a value read from the item as it stood before the
 * update, or with nothing when the item does not have what it points at. An
 * update has no literals, so every constant arrives through
 * `ExpressionAttributeValues`.
 */
export interface SimDynamoDbUpdateOperand {
  /**
   * How the expression wrote this operand, for a refusal to name.
   */
  readonly text: string;

  /**
   * The value this operand has for the item, if it has one.
   */
  valueIn(snapshot: SimDynamoDbItemSnapshot): SimDynamoDbValue | undefined;
}

/**
 * An operand carrying a value the request supplied, through
 * `ExpressionAttributeValues`.
 */
export class SimDynamoDbUpdateValueOperand implements SimDynamoDbUpdateOperand {
  public readonly text: string;

  /**
   * The value itself, which is the same whatever the item holds. ADD and DELETE
   * read it directly, since neither of them takes anything else.
   */
  public readonly value: SimDynamoDbValue;

  constructor(text: string, value: SimDynamoDbValue) {
    this.text = text;
    this.value = value;
  }

  valueIn(): SimDynamoDbValue {
    return this.value;
  }
}

/**
 * An operand naming a place in the item.
 */
export class SimDynamoDbUpdatePathOperand implements SimDynamoDbUpdateOperand {
  private readonly path: SimDynamoDbDocumentPath;

  constructor(path: SimDynamoDbDocumentPath) {
    this.path = path;
  }

  get text(): string {
    return this.path.text;
  }

  valueIn(snapshot: SimDynamoDbItemSnapshot): SimDynamoDbValue | undefined {
    return snapshot.valueAt(this.path);
  }
}

/**
 * `if_not_exists(path, operand)`, which is how a SET action leaves a value that
 * is already there alone.
 *
 * The stored value wins when the path has one. Otherwise the second operand is
 * what gets assigned, which is what makes this the way to set a default.
 */
export class SimDynamoDbIfNotExistsOperand implements SimDynamoDbUpdateOperand {
  private readonly stored: SimDynamoDbUpdatePathOperand;
  private readonly otherwise: SimDynamoDbUpdateOperand;

  constructor(
    stored: SimDynamoDbUpdatePathOperand,
    otherwise: SimDynamoDbUpdateOperand,
  ) {
    this.stored = stored;
    this.otherwise = otherwise;
  }

  get text(): string {
    return `if_not_exists(${this.stored.text}, ${this.otherwise.text})`;
  }

  valueIn(snapshot: SimDynamoDbItemSnapshot): SimDynamoDbValue | undefined {
    return this.stored.valueIn(snapshot) ?? this.otherwise.valueIn(snapshot);
  }
}
