/**
 * The scopes a method asks a token for.
 *
 * A method with no scopes asks for nothing beyond a token its authorizer
 * accepted. A method with scopes is satisfied by any one of them, which is
 * what AWS documents: the check is any-of, not all-of.
 *
 * Only a `COGNITO_USER_POOLS` method has them, since they are checked against
 * the token's own `scope` claim.
 */
export class SimRestApiMethodScopes {
  public readonly values: readonly string[];

  constructor(values: readonly string[] = []) {
    this.values = values;
  }

  /**
   * Whether this method asks for no scope in particular.
   */
  get isEmpty(): boolean {
    return this.values.length === 0;
  }

  /**
   * Whether a token claiming these scopes may have this method.
   *
   * A token claiming no scopes at all, which is every Cognito id token, meets
   * no method scope and is refused by any method that asks for one.
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
