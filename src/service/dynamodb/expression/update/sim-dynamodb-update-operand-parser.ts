import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import { SimDynamoDbDocumentPathParser } from "../sim-dynamodb-document-path-parser.js";
import type { SimDynamoDbExpressionPlaceholders } from "../sim-dynamodb-expression-placeholders.js";
import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import {
  SimDynamoDbIfNotExistsOperand,
  type SimDynamoDbUpdateOperand,
  SimDynamoDbUpdatePathOperand,
  SimDynamoDbUpdateValueOperand,
} from "./sim-dynamodb-update-operand.js";
import { simDynamoDbUpdateUnsupported } from "./sim-dynamodb-update-refusal.js";

/**
 * The one function a SET action can call in the expressions supported so far.
 */
const ifNotExistsName = "if_not_exists";

/**
 * The operators an update expression can carry between two operands, which this
 * simulation does not work out.
 */
const arithmetic: ReadonlySet<string> = new Set(["+", "-"]);

interface SimDynamoDbUpdateOperandParserProperties {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly names: SimDynamoDbExpressionPlaceholders<string>;
  readonly values: SimDynamoDbExpressionPlaceholders<SimDynamoDbValue>;
}

/**
 * Reads what a SET action assigns.
 *
 * An operand is a value the request supplied, a document path, or an
 * `if_not_exists` call. Which one it is shows in its first token, so nothing
 * here has to look far ahead.
 */
export class SimDynamoDbUpdateOperandParser {
  private readonly tokens: SimDynamoDbExpressionTokens;
  private readonly names: SimDynamoDbExpressionPlaceholders<string>;
  private readonly values: SimDynamoDbExpressionPlaceholders<SimDynamoDbValue>;

  constructor(properties: SimDynamoDbUpdateOperandParserProperties) {
    this.tokens = properties.tokens;
    this.names = properties.names;
    this.values = properties.values;
  }

  /**
   * Read one operand, refusing arithmetic on what follows it.
   */
  parse(): SimDynamoDbUpdateOperand {
    const operand = this.operand();

    this.refuseArithmetic();

    return operand;
  }

  /**
   * Read a document path, which is what both `if_not_exists` and a bare operand
   * point with.
   */
  private parsePath(): SimDynamoDbUpdatePathOperand {
    return new SimDynamoDbUpdatePathOperand(
      new SimDynamoDbDocumentPathParser({
        tokens: this.tokens,
        names: this.names,
      }).parse(),
    );
  }

  /**
   * Read whichever of the three shapes an operand is.
   */
  private operand(): SimDynamoDbUpdateOperand {
    const token = this.tokens.peek();

    if (token?.kind === "valuePlaceholder") {
      this.tokens.next("a value");

      return new SimDynamoDbUpdateValueOperand(
        token.text,
        this.values.required(token.text),
      );
    }

    if (this.isFunctionCall()) {
      return this.call();
    }

    return this.parsePath();
  }

  /**
   * Whether what comes next is a function call rather than a path starting with
   * an attribute of that name.
   */
  private isFunctionCall(): boolean {
    const token = this.tokens.peek();
    const after = this.tokens.peek(1);

    return (
      token?.kind === "name" && after?.kind === "symbol" && after.text === "("
    );
  }

  /**
   * Read a function call, refusing every function but `if_not_exists`.
   */
  private call(): SimDynamoDbUpdateOperand {
    const name = this.tokens.next("a function name").text;
    this.tokens.next("(");

    if (name !== ifNotExistsName) {
      throw simDynamoDbUpdateUnsupported(
        `The update expression function ${name}`,
        "working out a value it cannot build",
      );
    }

    const stored = this.parsePath();
    this.tokens.expectSymbol(
      ",",
      `syntax error; ${ifNotExistsName} takes a document path and a value`,
    );

    const otherwise = this.parse();
    this.tokens.expectSymbol(
      ")",
      `syntax error; ${ifNotExistsName} is not closed`,
    );

    return new SimDynamoDbIfNotExistsOperand(stored, otherwise);
  }

  /**
   * Refuse the arithmetic an update expression can carry between two operands.
   *
   * `SET n = n + :one` is a valid update on AWS. Reading the operator and
   * refusing it by name says so, where leaving `+` out of the expressions this
   * simulation reads at all would refuse it as an unexpected character.
   */
  private refuseArithmetic(): void {
    const token = this.tokens.peek();

    if (token?.kind === "symbol" && arithmetic.has(token.text)) {
      throw simDynamoDbUpdateUnsupported(
        `Arithmetic in an update expression, at '${token.text}'`,
        "assigning a value it has not worked out",
      );
    }
  }
}
