import { SimCognitoAliasExistsException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import type { SimCognitoAttributeType } from "../../user-pool/user/sim-cognito-user-attributes.js";

/**
 * Refuses an attribute update taking a value another user of the pool signs
 * in by.
 *
 * A pool with `UsernameAttributes` identifies its users by that attribute, so
 * two users holding the same value would leave a sign-in naming an account
 * the pool has two of. Real Cognito answers `AliasExistsException` here, and
 * so does this. A pool that signs users in by username has nothing to check:
 * the attribute names nothing there.
 */
export class SimCognitoSignInValueCheck {
  private readonly pool: SimCognitoUserPool;

  constructor(pool: SimCognitoUserPool) {
    this.pool = pool;
  }

  /**
   * Check an update before any of its attributes is written, so a refused one
   * changes nothing.
   *
   * A user setting the value it already signs in by is left alone, because
   * the user the value reaches is that same user.
   */
  requireFreeFor(
    user: SimCognitoUser,
    requested: readonly SimCognitoAttributeType[] | undefined,
  ): void {
    const signInBy = this.pool.settings.usernameAttributes;
    const attributes = requested ?? [];

    for (const attribute of attributes) {
      const { Name: name, Value: value } = attribute;

      if (
        name === undefined ||
        value === undefined ||
        !signInBy.names.includes(name)
      ) {
        continue;
      }

      this.requireFree(user, name, value);
    }
  }

  /**
   * Refuse one value another user of the pool holds.
   */
  private requireFree(user: SimCognitoUser, name: string, value: string): void {
    const held = this.pool.findUser(value);

    if (held !== undefined && held !== user) {
      throw new SimCognitoAliasExistsException(
        `An account with the given ${name} already exists.`,
      );
    }
  }
}
