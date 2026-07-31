import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import { SimDynamoDbDocumentPathParser } from "../sim-dynamodb-document-path-parser.js";
import type { SimDynamoDbExpressionPlaceholders } from "../sim-dynamodb-expression-placeholders.js";
import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import { SimDynamoDbArithmeticOperand } from "./sim-dynamodb-update-computed-operand.js";
import { SimDynamoDbUpdateFunctionParser } from "./sim-dynamodb-update-function-parser.js";
import {
  type SimDynamoDbUpdateOperand,
  SimDynamoDbUpdatePathOperand,
  SimDynamoDbUpdateValueOperand,
} from "./sim-dynamodb-update-operand.js";
import { simDynamoDbUpdateError } from "./sim-dynamodb-update-refusal.js";

/**
 * The operators an update expression carries between two operands.
 */
const operators: ReadonlySet<string> = new Set(["+", "-"]);

interface SimDynamoDbUpdateOperandParserProperties {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly names: SimDynamoDbExpressionPlaceholders<string>;
  readonly values: SimDynamoDbExpressionPlaceholders<SimDynamoDbValue>;
}

/**
 * Reads what a SET action assigns.
 *
 * An operand is a value the request supplied, a document path, or a call to
 * `if_not_exists` or `list_append`. Which one it is shows in its first token,
 * so nothing here has to look far ahead.
 *
 * Two operands may be joined by one `+` or `-`. DynamoDB takes exactly one,
 * with no chaining and no brackets, so `:a + :b + :c` is a syntax error there
 * and here.
 */
export class SimDynamoDbUpdateOperandParser {
  private readonly tokens: SimDynamoDbExpressionTokens;
  private readonly names: SimDynamoDbExpressionPlaceholders<string>;
  private readonly values: SimDynamoDbExpressionPlaceholders<SimDynamoDbValue>;
  private readonly functions: SimDynamoDbUpdateFunctionParser;

  constructor(properties: SimDynamoDbUpdateOperandParserProperties) {
    this.tokens = properties.tokens;
    this.names = properties.names;
    this.values = properties.values;
    this.functions = new SimDynamoDbUpdateFunctionParser({
      tokens: properties.tokens,
      operands: this,
    });
  }

  /**
   * Read what a SET action assigns, which is one operand or two with an
   * operator between them.
   */
  parse(): SimDynamoDbUpdateOperand {
    const left = this.operand();
    const operator = this.operator();

    if (operator === undefined) {
      return left;
    }

    const total = new SimDynamoDbArithmeticOperand(
      left,
      operator,
      this.operand(),
    );

    this.refuseFurtherOperators();

    return total;
  }

  /**
   * Read the value a request supplied, which is what ADD and DELETE take.
   *
   * Neither reads a document path: they change one attribute by an amount the
   * request carries, so a path there has nothing to mean.
   */
  parseValue(clause: string): SimDynamoDbUpdateValueOperand {
    const token = this.tokens.peek();

    if (token?.kind !== "valuePlaceholder") {
      throw simDynamoDbUpdateError(
        `syntax error; ${clause} takes a document path and a value from ` +
          `ExpressionAttributeValues, and ` +
          `'${token?.text ?? "the end of the expression"}' is not one`,
      );
    }

    return this.valueOperand(token.text);
  }

  /**
   * Read one operand, which is where the grammar stops nesting.
   */
  operand(): SimDynamoDbUpdateOperand {
    const token = this.tokens.peek();

    if (token?.kind === "valuePlaceholder") {
      return this.valueOperand(token.text);
    }

    if (this.functions.isCall()) {
      return this.functions.parse();
    }

    return this.path();
  }

  /**
   * Read a document path.
   */
  path(): SimDynamoDbUpdatePathOperand {
    return new SimDynamoDbUpdatePathOperand(
      new SimDynamoDbDocumentPathParser({
        tokens: this.tokens,
        names: this.names,
      }).parse(),
    );
  }

  /**
   * Read the value placeholder the expression is sitting on.
   */
  private valueOperand(placeholder: string): SimDynamoDbUpdateValueOperand {
    this.tokens.next("a value");

    return new SimDynamoDbUpdateValueOperand(
      placeholder,
      this.values.required(placeholder),
    );
  }

  /**
   * Read the operator between two operands, if there is one.
   */
  private operator(): "+" | "-" | undefined {
    if (this.tokens.takeSymbol("+")) {
      return "+";
    }

    if (this.tokens.takeSymbol("-")) {
      return "-";
    }

    return undefined;
  }

  /**
   * Refuse the second operator of a sum DynamoDB will not work out.
   */
  private refuseFurtherOperators(): void {
    const token = this.tokens.peek();

    if (token?.kind === "symbol" && operators.has(token.text)) {
      throw simDynamoDbUpdateError(
        `syntax error; one '+' or '-' joins two operands, and '${token.text}' ` +
          `starts a third`,
      );
    }
  }
}
