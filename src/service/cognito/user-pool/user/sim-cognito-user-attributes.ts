import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import { isSimCognitoStandardAttribute } from "./sim-cognito-standard-attributes.js";

/**
 * One user attribute, in the shape Cognito reads and reports it.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AttributeType.html
 */
export interface SimCognitoAttributeType {
  readonly Name?: string | undefined;
  readonly Value?: string | undefined;
}

const maxAttributeValueLength = 2048;

/**
 * The attributes held on one simulated user.
 *
 * Attribute names are checked against the pool's schema rather than stored as
 * written, because real Cognito refuses an attribute its schema does not hold.
 * A pool created here has the standard schema and nothing else, so a
 * `custom:` attribute is refused the same way it would be on a real pool
 * created without it.
 *
 * `sub` is not among them. Cognito allocates it, and a request setting it is
 * refused, so it lives on the user rather than in its attributes.
 */
export class SimCognitoUserAttributes {
  private readonly byName = new Map<string, string>();

  constructor(requested?: readonly SimCognitoAttributeType[]) {
    this.update(requested);
  }

  private static requireName(name: string | undefined): string {
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

    if (!isSimCognitoStandardAttribute(name)) {
      throw new SimCognitoInvalidParameterException(
        `User attribute '${name}' is not in the pool's schema: a pool here ` +
          `holds the standard attributes only, because CreateUserPool ` +
          `refuses a Schema of its own, so custom attributes cannot exist`,
      );
    }

    return name;
  }

  private static requireValue(name: string, value: string | undefined): string {
    if (value === undefined) {
      throw new SimCognitoInvalidParameterException(
        `User attribute '${name}' needs a Value`,
      );
    }

    if (value.length > maxAttributeValueLength) {
      throw new SimCognitoInvalidParameterException(
        `User attribute '${name}' is longer than the ` +
          `${String(maxAttributeValueLength)} characters Cognito allows`,
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
      const name = SimCognitoUserAttributes.requireName(attribute.Name);

      this.byName.set(
        name,
        SimCognitoUserAttributes.requireValue(name, attribute.Value),
      );
    }
  }
}
