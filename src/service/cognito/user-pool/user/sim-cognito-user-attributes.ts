import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoSchemaAttribute } from "../schema/sim-cognito-schema-attribute.js";
import type { SimCognitoUserPoolSchema } from "../schema/sim-cognito-user-pool-schema.js";

/**
 * One user attribute, in the shape Cognito reads and reports it.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AttributeType.html
 */
export interface SimCognitoAttributeType {
  readonly Name?: string | undefined;
  readonly Value?: string | undefined;
}

interface SimCognitoUserAttributesProperties {
  /** The schema of the pool the user belongs to, which every write is held to. */
  readonly schema: SimCognitoUserPoolSchema;

  /** The attributes the request creating the user set. */
  readonly requested?: readonly SimCognitoAttributeType[] | undefined;
}

/**
 * The attributes held on one simulated user.
 *
 * Attribute names are checked against the pool's schema rather than stored as
 * written, because real Cognito refuses an attribute its schema does not hold.
 * A pool created without a `Schema` of its own has the standard attributes and
 * nothing else, so a `custom:` attribute is refused there exactly as it would
 * be on a real pool created the same way.
 *
 * The schema decides more than the name: what kind of value the attribute
 * holds, how long or how large it may be, and whether a user that already has
 * it can be given another value.
 *
 * `sub` is not among them. Cognito allocates it, and a request setting it is
 * refused, so it lives on the user rather than in its attributes.
 */
export class SimCognitoUserAttributes {
  private readonly byName = new Map<string, string>();
  private readonly schema: SimCognitoUserPoolSchema;

  constructor(properties: SimCognitoUserAttributesProperties) {
    this.schema = properties.schema;
    this.update(properties.requested);
    this.schema.requireEveryRequired(new Set(this.byName.keys()));
  }

  private static requireValue(name: string, value: string | undefined): string {
    if (value === undefined) {
      throw new SimCognitoInvalidParameterException(
        `User attribute '${name}' needs a Value`,
      );
    }

    return value;
  }

  /**
   * The attributes by name, in the order they were first set.
   */
  get values(): ReadonlyMap<string, string> {
    return this.byName;
  }

  /**
   * The attributes, in the order they were first set.
   */
  get entries(): readonly SimCognitoAttributeType[] {
    return this.byName
      .entries()
      .map(([name, value]) => ({ Name: name, Value: value }))
      .toArray();
  }

  /**
   * Mark the named attributes verified, where they are held.
   *
   * This is what a pool's `AutoVerifiedAttributes` reaches when a user
   * confirms its sign-up. An attribute the user does not have is left alone
   * rather than flagged as verified, because there was nothing to verify.
   */
  verify(names: readonly string[]): void {
    this.update(
      names
        .filter((name) => this.byName.has(name))
        .map((name) => ({ Name: `${name}_verified`, Value: "true" })),
    );
  }

  /**
   * Apply requested attributes over the ones already held.
   *
   * An update names only the attributes it changes, as `AdminUpdateUserAttributes`
   * does on real Cognito: an attribute the request says nothing about keeps its
   * value rather than being cleared.
   */
  update(requested?: readonly SimCognitoAttributeType[]): void {
    if (requested === undefined) {
      return;
    }

    for (const attribute of requested) {
      this.write(attribute);
    }
  }

  /**
   * Write one attribute, holding it to everything the schema says about it.
   *
   * An attribute the user already has is a change rather than a first value,
   * and the schema is what says whether a change is allowed at all.
   */
  private write(requested: SimCognitoAttributeType): void {
    const attribute = this.requireInSchema(requested.Name);
    const value = SimCognitoUserAttributes.requireValue(
      attribute.name,
      requested.Value,
    );

    if (this.byName.has(attribute.name)) {
      attribute.requireMutable();
    }

    attribute.requireValue(value);
    this.byName.set(attribute.name, value);
  }

  /**
   * The schema attribute a request names, or a refusal saying why the pool has
   * no such attribute.
   */
  private requireInSchema(name: string | undefined): SimCognitoSchemaAttribute {
    if (name === undefined || name === "") {
      throw new SimCognitoInvalidParameterException(
        "A user attribute needs a Name saying which attribute it sets",
      );
    }

    if (name === "sub") {
      throw new SimCognitoInvalidParameterException(
        "User attribute 'sub' is read-only: Cognito allocates a user's sub " +
          "when the user is created, and a request cannot set it",
      );
    }

    const attribute = this.schema.find(name);

    if (attribute === undefined) {
      throw new SimCognitoInvalidParameterException(
        `User attribute '${name}' is not in the pool's schema: ${this.schema.describeHolding()}`,
      );
    }

    return attribute;
  }
}
