import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbExpressionPlaceholders } from "../sim-dynamodb-expression-placeholders.js";
import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import {
  SimDynamoDbRemoveAction,
  type SimDynamoDbUpdateAction,
  SimDynamoDbSetAction,
} from "./sim-dynamodb-update-action.js";
import { SimDynamoDbAddAction } from "./sim-dynamodb-update-add-action.js";
import { SimDynamoDbUpdateClauses } from "./sim-dynamodb-update-clause.js";
import { SimDynamoDbDeleteAction } from "./sim-dynamodb-update-delete-action.js";
import { SimDynamoDbUpdateOperandParser } from "./sim-dynamodb-update-operand-parser.js";
import { SimDynamoDbUpdate } from "./sim-dynamodb-update.js";

interface SimDynamoDbUpdateParserProperties {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly names: SimDynamoDbExpressionPlaceholders<string>;
  readonly values: SimDynamoDbExpressionPlaceholders<SimDynamoDbValue>;
}

/**
 * Reads an UpdateExpression into the actions it asks for.
 *
 * An expression is a run of clauses, each of which is a keyword and then its
 * comma-separated actions. The clauses may come in any order, and each keyword
 * appears at most once.
 */
export class SimDynamoDbUpdateParser {
  private readonly tokens: SimDynamoDbExpressionTokens;
  private readonly clauses: SimDynamoDbUpdateClauses;
  private readonly operands: SimDynamoDbUpdateOperandParser;
  private readonly actions: SimDynamoDbUpdateAction[] = [];

  constructor(properties: SimDynamoDbUpdateParserProperties) {
    this.tokens = properties.tokens;
    this.clauses = new SimDynamoDbUpdateClauses(properties);
    this.operands = new SimDynamoDbUpdateOperandParser(properties);
  }

  /**
   * Read the whole expression.
   */
  parse(): SimDynamoDbUpdate {
    do {
      this.clause();
    } while (!this.tokens.atEnd);

    return new SimDynamoDbUpdate(this.actions);
  }

  /**
   * Read one clause, which is its keyword and then its comma-separated actions.
   */
  private clause(): void {
    const word = this.clauses.keyword();

    do {
      this.actions.push(this.action(word));
    } while (this.tokens.takeSymbol(","));
  }

  /**
   * Read one action of the clause that was named.
   */
  private action(word: string): SimDynamoDbUpdateAction {
    if (word === "SET") {
      return this.setAction();
    }

    if (word === "REMOVE") {
      return new SimDynamoDbRemoveAction(this.clauses.target());
    }

    if (word === "ADD") {
      return new SimDynamoDbAddAction(
        this.clauses.attributeTarget(word),
        this.operands.parseValue(word),
      );
    }

    return new SimDynamoDbDeleteAction(
      this.clauses.attributeTarget(word),
      this.operands.parseValue(word),
    );
  }

  /**
   * Read a `path = operand` action of a SET clause.
   */
  private setAction(): SimDynamoDbUpdateAction {
    const target = this.clauses.target();

    this.tokens.expectSymbol(
      "=",
      `syntax error; a SET action assigns to a document path with '='`,
    );

    return new SimDynamoDbSetAction(target, this.operands.parse());
  }
}
