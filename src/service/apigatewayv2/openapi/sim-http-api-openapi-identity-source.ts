import type { SimHttpApiOpenApiObject } from "./sim-http-api-openapi-object.js";
import type { SimHttpApiOpenApiValue } from "./sim-http-api-openapi-value.js";

/**
 * The `identitySource` of an `x-amazon-apigateway-authorizer`.
 *
 * A document writes the sources as one comma-separated string, and
 * CreateAuthorizer takes a list, so the translation is here. How many a
 * document may name is the kind of authorizer's business: a JWT one reads the
 * token from one place, and a `REQUEST` one requires everything it names.
 */
export class SimHttpApiOpenApiIdentitySource {
  private readonly declared: SimHttpApiOpenApiValue;

  constructor(authorizer: SimHttpApiOpenApiObject) {
    this.declared = authorizer.member("identitySource");
  }

  /**
   * Every source the document names, which is what a `REQUEST` authorizer
   * requires a request to carry.
   */
  all(): string[] {
    return this.sources();
  }

  /**
   * The one place a JWT authorizer reads its token from, refusing a document
   * naming more.
   */
  one(): string[] {
    const sources = this.sources();

    if (sources.length > 1) {
      throw this.declared.refusal(
        `carries ${String(sources.length)} identity sources, and only the ` +
          `first would be read here`,
      );
    }

    return sources;
  }

  private sources(): string[] {
    return this.declared
      .requiredString()
      .split(",")
      .map((source) => source.trim())
      .filter((source) => source.length > 0);
  }
}
