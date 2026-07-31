import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbNumber } from "../../item/sim-dynamodb-number.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbItemSnapshot } from "../sim-dynamodb-item-snapshot.js";
import type { SimDynamoDbUpdateOperand } from "./sim-dynamodb-update-operand.js";

/**
 * `list_append(one, other)`, which is the two lists end to end in the order
 * they were written.
 */
export class SimDynamoDbListAppendOperand implements SimDynamoDbUpdateOperand {
  private readonly first: SimDynamoDbUpdateOperand;
  private readonly second: SimDynamoDbUpdateOperand;

  constructor(
    first: SimDynamoDbUpdateOperand,
    second: SimDynamoDbUpdateOperand,
  ) {
    this.first = first;
    this.second = second;
  }

  /**
   * How the expression wrote this call.
   */
  get text(): string {
    return `list_append(${this.first.text}, ${this.second.text})`;
  }

  /**
   * The two lists end to end, or nothing when either argument points at
   * nothing.
   */
  valueIn(snapshot: SimDynamoDbItemSnapshot): SimDynamoDbValue | undefined {
    const first = this.first.valueIn(snapshot);
    const second = this.second.valueIn(snapshot);

    if (first === undefined || second === undefined) {
      return undefined;
    }

    return {
      kind: "L",
      values: [...this.listOf(first), ...this.listOf(second)],
    };
  }

  /**
   * The list an argument has to be.
   */
  private listOf(value: SimDynamoDbValue): readonly SimDynamoDbValue[] {
    if (value.kind !== "L") {
      throw incorrectOperandType("list_append", value.kind, this.text);
    }

    return value.values;
  }
}

/**
 * `one + other` or `one - other`, which is the only arithmetic an update
 * expression carries.
 *
 * DynamoDB takes one operator and no brackets, so nothing here nests. Both
 * sides have to be numbers the item actually holds, which is why the usual
 * counter is written `if_not_exists(count, :zero) + :one`.
 */
export class SimDynamoDbArithmeticOperand implements SimDynamoDbUpdateOperand {
  private readonly left: SimDynamoDbUpdateOperand;
  private readonly right: SimDynamoDbUpdateOperand;
  private readonly operator: "+" | "-";

  constructor(
    left: SimDynamoDbUpdateOperand,
    operator: "+" | "-",
    right: SimDynamoDbUpdateOperand,
  ) {
    this.left = left;
    this.operator = operator;
    this.right = right;
  }

  /**
   * How the expression wrote this sum.
   */
  get text(): string {
    return `${this.left.text} ${this.operator} ${this.right.text}`;
  }

  /**
   * The total, or nothing when either side points at nothing.
   */
  valueIn(snapshot: SimDynamoDbItemSnapshot): SimDynamoDbValue | undefined {
    const left = this.left.valueIn(snapshot);
    const right = this.right.valueIn(snapshot);

    if (left === undefined || right === undefined) {
      return undefined;
    }

    return { kind: "N", number: this.total(left, right) };
  }

  /**
   * The two numbers put together, on their digits rather than through a
   * JavaScript number.
   */
  private total(
    left: SimDynamoDbValue,
    right: SimDynamoDbValue,
  ): SimDynamoDbNumber {
    if (this.operator === "+") {
      return this.numberOf(left).plus(this.numberOf(right));
    }

    return this.numberOf(left).minus(this.numberOf(right));
  }

  /**
   * The number an operand has to be.
   */
  private numberOf(value: SimDynamoDbValue): SimDynamoDbNumber {
    if (value.kind !== "N") {
      throw incorrectOperandType("+ or -", value.kind, this.text);
    }

    return value.number;
  }
}

/**
 * Refuse an operand of a type the operator or function has no meaning for.
 */
function incorrectOperandType(
  operation: string,
  kind: string,
  text: string,
): SimDynamoDbValidationException {
  return new SimDynamoDbValidationException(
    `Invalid UpdateExpression: Incorrect operand type for operator or ` +
      `function; operator or function: ${operation}, operand type: ${kind}, ` +
      `in '${text}'`,
  );
}
