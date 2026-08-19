/**
 * An RFC 6901 JSON pointer into the document being imported.
 *
 * Every refusal names one, so a reader can find the member in their own
 * document rather than in a paraphrase of it. Pointers are built up as the
 * readers descend, so a member inside an operation carries the whole route to
 * itself:
 *
 *   #/paths/~1pets~1{petId}/get/x-amazon-apigateway-integration/uri
 */
export class SimRestApiOpenApiPointer {
  private readonly tokens: readonly string[];

  private constructor(tokens: readonly string[]) {
    this.tokens = tokens;
  }

  /**
   * The pointer to the document itself.
   */
  static root(): SimRestApiOpenApiPointer {
    return new SimRestApiOpenApiPointer([]);
  }

  /**
   * The pointer to a member of whatever this one points at.
   */
  child(token: string): SimRestApiOpenApiPointer {
    return new SimRestApiOpenApiPointer([...this.tokens, token]);
  }

  /**
   * The pointer written as RFC 6901 writes it, in the URI fragment form, with
   * `~` escaped as `~0` and `/` as `~1`. A path template is therefore
   * `~1pets~1{petId}` rather than the path itself.
   */
  toString(): string {
    return ["#", ...this.tokens.map((token) => escapeToken(token))].join("/");
  }
}

/**
 * Escape the two characters RFC 6901 gives a meaning to inside a token.
 */
function escapeToken(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}
