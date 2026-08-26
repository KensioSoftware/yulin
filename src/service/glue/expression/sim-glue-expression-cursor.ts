import {
  simGlueExpressionAt,
  simGlueExpressionError,
} from "./sim-glue-expression-error.js";
import type { SimGlueExpressionToken } from "./sim-glue-expression-token.js";
import { simGlueExpressionTokens } from "./sim-glue-expression-tokeniser.js";

/**
 * A parser's place in the tokens of one expression.
 *
 * The parser reads forwards and never goes back, so how far along it is, and
 * what happens when it runs out, live here.
 */
export class SimGlueExpressionCursor {
  readonly #tokens: readonly SimGlueExpressionToken[];
  #position = 0;

  constructor(expression: string) {
    this.#tokens = simGlueExpressionTokens(expression);
  }

  /** Whether every token has been read. */
  get atEnd(): boolean {
    return this.#position >= this.#tokens.length;
  }

  /** The next token, without reading it. */
  peek(): SimGlueExpressionToken | undefined {
    return this.#tokens.at(this.#position);
  }

  /** Read the next token, refusing an expression that has run out. */
  next(expected: string): SimGlueExpressionToken {
    const upcoming = this.peek();

    if (upcoming === undefined) {
      throw this.error(`${expected} was expected`);
    }

    this.#position += 1;

    return upcoming;
  }

  /** Read the next token when it is this symbol, and leave it otherwise. */
  takeSymbol(text: string): boolean {
    return this.#take("symbol", text, false);
  }

  /**
   * Read the next token when it is this keyword, and leave it otherwise.
   *
   * A keyword arrives as a name, since that is what it looks like. Glue reads
   * them whatever case they are written in, and so does this.
   */
  takeKeyword(word: string): boolean {
    return this.#take("name", word, true);
  }

  /** Read a symbol the expression has to carry here. */
  expectSymbol(text: string): void {
    if (!this.takeSymbol(text)) {
      throw this.error(`'${text}' was expected`);
    }
  }

  /** Read a keyword the expression has to carry here. */
  expectKeyword(word: string): void {
    if (!this.takeKeyword(word)) {
      throw this.error(`${word} was expected`);
    }
  }

  /** Build the error this expression is refused with, saying where it is. */
  error(reason: string): Error {
    return simGlueExpressionError(reason, simGlueExpressionAt(this.peek()));
  }

  #take(kind: "name" | "symbol", text: string, fold: boolean): boolean {
    const candidate = this.peek();

    if (candidate?.kind !== kind) {
      return false;
    }

    const written = fold ? candidate.text.toUpperCase() : candidate.text;

    if (written !== text) {
      return false;
    }

    this.#position += 1;

    return true;
  }
}
