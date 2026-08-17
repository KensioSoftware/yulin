import { randomUUID } from "node:crypto";
import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";
import { SimCognitoSignInAttribute } from "./sim-cognito-sign-in-attribute.js";
import type { SimCognitoAttributeType } from "./user/sim-cognito-user-attributes.js";
import {
  requireSimCognitoUsername,
  type SimCognitoUsername,
} from "./user/sim-cognito-username.js";

/**
 * What a new user of a pool is stored as: the username it is keyed by, and
 * the attributes it starts with.
 */
export interface SimCognitoNewUserIdentity {
  readonly username: SimCognitoUsername;
  readonly attributes: readonly SimCognitoAttributeType[] | undefined;
}

/**
 * The attributes a pool signs its users in by, from its `UsernameAttributes`.
 *
 * A pool created without any is signed in by username, and a request naming a
 * user names the username it was created with. A pool created with them works
 * the other way round: the caller signs in by email or by phone number, and
 * the username is a UUID Cognito generates that no caller ever chose. That is
 * what an application built against such a pool sees in `cognito:username` and
 * in `AdminGetUser`, so it is what this simulation stores.
 *
 * The address itself stays reachable. It goes into the attribute the pool
 * signs in by, and a request naming a user by that address resolves the same
 * user, which is the alias resolution real Cognito does for its admin
 * operations and its sign-ins.
 */
export class SimCognitoUsernameAttributes {
  private readonly attributes: readonly SimCognitoSignInAttribute[];

  constructor(requested?: readonly string[]) {
    this.attributes = (requested ?? []).map(
      (name) => new SimCognitoSignInAttribute(name),
    );
  }

  /**
   * The attribute a new user's own value goes into, alongside the attributes
   * the request asked for.
   *
   * A request that set the attribute itself keeps its own value, as long as
   * it is the one the username says. The two naming different accounts is
   * refused rather than resolved in favour of either, because real Cognito
   * signs the user in by only one of them and code written against the other
   * would look up a user that is not there.
   */
  private static withSignInValue(
    attribute: SimCognitoSignInAttribute,
    value: string,
    attributes: readonly SimCognitoAttributeType[] | undefined,
  ): readonly SimCognitoAttributeType[] {
    const requested = attributes ?? [];
    const given = requested.find((entry) => entry.Name === attribute.name);

    if (given === undefined) {
      return [...requested, { Name: attribute.name, Value: value }];
    }

    if (given.Value !== value) {
      throw new SimCognitoInvalidParameterException(
        `Username '${value}' and the ${attribute.name} attribute ` +
          `'${String(given.Value)}' name different accounts: a pool that ` +
          `signs users in by ${attribute.name} takes the username as that ` +
          `attribute's value`,
      );
    }

    return requested;
  }

  /**
   * Whether the pool signs users in by username, which is the default.
   */
  get isEmpty(): boolean {
    return this.attributes.length === 0;
  }

  /**
   * The attribute names, as the request gave them.
   */
  get names(): readonly string[] {
    return this.attributes.map((attribute) => attribute.name);
  }

  /**
   * These attributes as a described pool reports them, or nothing where the
   * pool signs users in by username.
   */
  toOutput(): readonly string[] | undefined {
    if (this.isEmpty) {
      return undefined;
    }

    return this.names;
  }

  /**
   * The username and attributes a user being created is stored with.
   *
   * A pool signing users in by username stores what the request asked for. A
   * pool signing them in by an attribute stores a generated UUID instead, and
   * puts the value the request called the username into the attribute it
   * signs in by, which is what real Cognito does with it.
   */
  identify(
    requested: SimCognitoUsername,
    attributes: readonly SimCognitoAttributeType[] | undefined,
  ): SimCognitoNewUserIdentity {
    if (this.isEmpty) {
      return { username: requested, attributes };
    }

    const attribute = this.requireSignInAttribute(requested);

    return {
      username: requireSimCognitoUsername(randomUUID()),
      attributes: SimCognitoUsernameAttributes.withSignInValue(
        attribute,
        requested,
        attributes,
      ),
    };
  }

  /**
   * The values a user can be signed in by, by the attribute each is held in.
   *
   * A user missing the attribute has no value for it, which is how a
   * federated user reaches a pool that signs its own users in by email: the
   * provider's mapping may not carry one.
   */
  signInValues(
    attributes: ReadonlyMap<string, string>,
  ): ReadonlyMap<string, string> {
    const values = new Map<string, string>();

    for (const attribute of this.attributes) {
      const value = attributes.get(attribute.name);

      if (value !== undefined) {
        values.set(attribute.name, value);
      }
    }

    return values;
  }

  /**
   * Whether a user holding these attributes is the one a value names.
   */
  matches(attributes: ReadonlyMap<string, string>, value: string): boolean {
    return this.attributes.some(
      (attribute) => attributes.get(attribute.name) === value,
    );
  }

  /**
   * The attribute a username fills, or a refusal saying what the pool signs
   * users in by.
   *
   * Real Cognito refuses a username of the wrong form here rather than
   * creating a user nobody could sign in as.
   */
  private requireSignInAttribute(username: string): SimCognitoSignInAttribute {
    const attribute = this.attributes.find((candidate) =>
      candidate.holds(username),
    );

    if (attribute === undefined) {
      throw new SimCognitoInvalidParameterException(
        `Username should be ${this.describeForms()}.`,
      );
    }

    return attribute;
  }

  /**
   * How a refusal describes what this pool's usernames have to look like.
   */
  private describeForms(): string {
    const descriptions = this.attributes.map(
      (attribute) => attribute.description,
    );

    if (descriptions.length > 1) {
      return `either ${descriptions.join(" or ")}`;
    }

    return descriptions.join(" or ");
  }
}
