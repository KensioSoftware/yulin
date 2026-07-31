import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import { SimDynamoDbDocumentPathParser } from "../sim-dynamodb-document-path-parser.js";
import type { SimDynamoDbExpressionPlaceholders } from "../sim-dynamodb-expression-placeholders.js";
import type { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import {
  SimDynamoDbRemoveAction,
  type SimDynamoDbUpdateAction,
  SimDynamoDbSetAction,
} from "./sim-dynamodb-update-action.js";
import { SimDynamoDbUpdateOperandParser } from "./sim-dynamodb-update-operand-parser.js";
import {
  simDynamoDbUpdateError,
  simDynamoDbUpdateUnsupported,
} from "./sim-dynamodb-update-refusal.js";
import { SimDynamoDbUpdateTarget } from "./sim-dynamodb-update-target.js";
import { SimDynamoDbUpdate } from "./sim-dynamodb-update.js";

/**
 * The clause keywords this simulation applies.
 */
const simulatedClauses: ReadonlySet<string> = new Set(["SET", "REMOVE"]);

/**
 * The clause keywords real DynamoDB has and this simulation does not apply.
 */
const unsimulatedClauses: ReadonlySet<string> = new Set(["ADD", "DELETE"]);

interface SimDynamoDbUpdateParserProperties {
  readonly tokens: SimDynamoDbExpressionTokens;
  readonly names: SimDynamoDbExpressionPlaceholders<string>;
  readonly values: SimDynamoDbExpressionPlaceholders<SimDynamoDbValue>;
}

/**
 * Reads an UpdateExpression into the actions it asks for.
 *
 * An expression is a run of clauses, each of which is a keyword and then its
 * comma-separated actions. The clauses may come in either order, and each
 * keyword appears at most once.
 */
export class SimDynamoDbUpdateParser {
  private readonly tokens: SimDynamoDbExpressionTokens;
  private readonly names: SimDynamoDbExpressionPlaceholders<string>;
  private readonly operands: SimDynamoDbUpdateOperandParser;
  private readonly clauses = new Set<string>();
  private readonly actions: SimDynamoDbUpdateAction[] = [];

  constructor(properties: SimDynamoDbUpdateParserProperties) {
    this.tokens = properties.tokens;
    this.names = properties.names;
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
   * Read one clause, which is its keyword and then its actions.
   */
  private clause(): void {
    const word = this.keyword();

    if (this.clauses.has(word)) {
      throw simDynamoDbUpdateError(
        `The "${word}" section can only be used once in an update expression;`,
      );
    }

    this.clauses.add(word);

    if (word === "SET") {
      this.setActions();

      return;
    }

    this.removeActions();
  }

  /**
   * Read the keyword a clause starts with.
   */
  private keyword(): string {
    const token = this.tokens.next("SET or REMOVE");
    const word = token.text.toUpperCase();

    if (token.kind === "name" && unsimulatedClauses.has(word)) {
      throw simDynamoDbUpdateUnsupported(
        `The ${word} clause of an update expression`,
        "applying a change this simulation cannot work out",
      );
    }

    if (token.kind !== "name" || !simulatedClauses.has(word)) {
      throw simDynamoDbUpdateError(
        `syntax error; SET or REMOVE expected, but '${token.text}' was given`,
      );
    }

    return word;
  }

  /**
   * Read the `path = operand` actions of a SET clause.
   */
  private setActions(): void {
    do {
      const target = this.target();
      this.tokens.expectSymbol(
        "=",
        `syntax error; a SET action assigns to a document path with '='`,
      );

      this.actions.push(
        new SimDynamoDbSetAction(target, this.operands.parse()),
      );
    } while (this.tokens.takeSymbol(","));
  }

  /**
   * Read the document paths of a REMOVE clause.
   */
  private removeActions(): void {
    do {
      this.actions.push(new SimDynamoDbRemoveAction(this.target()));
    } while (this.tokens.takeSymbol(","));
  }

  /**
   * Read the document path one action writes to.
   */
  private target(): SimDynamoDbUpdateTarget {
    return new SimDynamoDbUpdateTarget(
      new SimDynamoDbDocumentPathParser({
        tokens: this.tokens,
        names: this.names,
      }).parse(),
    );
  }
}
