import type { SimDynamoDbExpressionPlaceholders } from "./sim-dynamodb-expression-placeholders.js";

/**
 * The attribute names one request's expressions reach.
 *
 * Every expression kind names attributes the same way, either outright or
 * behind a `#` placeholder, and every one of them reads those names through
 * here. Noting the names as they are read is what lets a request say which
 * attributes it names, which is what `dynamodb:Attributes` asks about.
 *
 * Only the attribute a document path starts at is noted. AWS counts a
 * top-level attribute as reached where the request names it or anything nested
 * inside it, so `Address.City` reaches `Address`.
 */
export class SimDynamoDbExpressionAttributes {
  private readonly placeholders: SimDynamoDbExpressionPlaceholders<string>;
  private readonly reached = new Set<string>();

  constructor(placeholders: SimDynamoDbExpressionPlaceholders<string>) {
    this.placeholders = placeholders;
  }

  /**
   * What a placeholder stands for, refusing one the request never defined.
   *
   * Resolving a placeholder says nothing about where in a path it sits, so
   * nothing is noted here.
   */
  required(placeholder: string): string {
    return this.placeholders.required(placeholder);
  }

  /**
   * Note a top-level attribute an expression named.
   */
  reach(name: string): void {
    this.reached.add(name);
  }

  /**
   * The top-level attributes every expression of the request named.
   */
  get topLevel(): readonly string[] {
    return [...this.reached];
  }
}
