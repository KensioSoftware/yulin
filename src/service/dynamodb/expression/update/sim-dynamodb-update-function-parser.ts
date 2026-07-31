import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import { SimDynamoDbListAppendOperand } from "./sim-dynamodb-update-computed-operand.js";
import {
  SimDynamoDbIfNotExistsOperand,
  type SimDynamoDbUpdateOperand,
  type SimDynamoDbUpdatePathOperand,
} from "./sim-dynamodb-update-operand.js";
import { simDynamoDbUpdateError } from "./sim-dynamodb-update-refusal.js";

/**
 * The functions a SET action can call.
 */
const ifNotExistsName = "if_not_exists";
const listAppendName = "list_append";

/**
 * What reads the operands a function's arguments are.
 *
 * The arguments of a function are operands rather than whole values, so
 * `if_not_exists(a, :v + :w)` is a syntax error on AWS. That is why this reads
 * back through the operand parser rather than parsing arguments itself.
 */
interface SimDynamoDbUpdateArguments {
  operand(): SimDynamoDbUpdateOperand;
  path(): SimDynamoDbUpdatePathOperand;
}

interface SimDynamoDbUpdateFunctionParserProperties {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly operands: SimDynamoDbUpdateArguments;
}

/**
 * Reads the function calls a SET action can carry.
 */
export class SimDynamoDbUpdateFunctionParser {
  private readonly tokens: SimDynamoDbExpressionTokens;
  private readonly operands: SimDynamoDbUpdateArguments;

  constructor(properties: SimDynamoDbUpdateFunctionParserProperties) {
    this.tokens = properties.tokens;
    this.operands = properties.operands;
  }

  /**
   * Whether what comes next is a function call rather than a path starting with
   * an attribute of that name.
   */
  isCall(): boolean {
    const token = this.tokens.peek();
    const after = this.tokens.peek(1);

    return (
      token?.kind === "name" && after?.kind === "symbol" && after.text === "("
    );
  }

  /**
   * Read one function call, refusing a function an update expression does not
   * have.
   */
  parse(): SimDynamoDbUpdateOperand {
    const name = this.tokens.next("a function name").text;
    this.tokens.next("(");

    const called = this.called(name);
    this.tokens.expectSymbol(")", `syntax error; ${name} is not closed`);

    return called;
  }

  /**
   * Read the arguments of the function that was named, and build it.
   */
  private called(name: string): SimDynamoDbUpdateOperand {
    if (name === ifNotExistsName) {
      const stored = this.operands.path();

      return new SimDynamoDbIfNotExistsOperand(stored, this.second(name));
    }

    if (name === listAppendName) {
      const first = this.operands.operand();

      return new SimDynamoDbListAppendOperand(first, this.second(name));
    }

    throw simDynamoDbUpdateError(
      `Invalid function name; function: ${name}. An update expression has ` +
        `${ifNotExistsName} and ${listAppendName}.`,
    );
  }

  /**
   * Read the comma and the operand after a function's first argument.
   */
  private second(name: string): SimDynamoDbUpdateOperand {
    this.tokens.expectSymbol(
      ",",
      `syntax error; ${name} takes two arguments separated by a comma`,
    );

    return this.operands.operand();
  }
}
