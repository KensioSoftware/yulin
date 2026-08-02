/**
 * The scopes a route asks a token for.
 *
 * A route with no scopes asks for nothing beyond a token the authorizer
 * accepted. A route with scopes is satisfied by any one of them, which is what
 * AWS documents: the check is any-of, not all-of.
 */
export class SimHttpApiRouteScopes {
  public readonly values: readonly string[];

  constructor(values: readonly string[] = []) {
    this.values = values;
  }

  /**
   * Whether this route asks for no scope in particular.
   */
  get isEmpty(): boolean {
    return this.values.length === 0;
  }

  /**
   * Whether a token claiming these scopes may have this route.
   *
   * A token claiming no scopes at all, which is every Cognito id token, meets
   * no route scope and is refused by any route that asks for one.
   */
  permits(claimed: readonly string[] | null): boolean {
    if (this.isEmpty) {
      return true;
    }

    if (claimed === null) {
      return false;
    }

    return claimed.some((scope) => this.values.includes(scope));
  }
}
