import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import {
  SimCognitoSchemaAttribute,
  type SimCognitoSchemaAttributeType,
} from "./sim-cognito-schema-attribute.js";
import {
  isSimCognitoStandardAttribute,
  simCognitoStandardAttributes,
} from "./sim-cognito-standard-attributes.js";

/**
 * How many attributes Cognito takes in one `Schema`.
 *
 * The list is what the limit is on, and a pool cannot reach the 50 custom
 * attributes it may hold any other way: `AddCustomAttributes` is what adds to
 * a schema afterwards, and that is not simulated.
 */
const maxSchemaAttributes = 50;

/**
 * The attributes one simulated user pool holds on its users.
 *
 * Every pool starts with the standard schema, and its `Schema` adds to it. A
 * declaration naming a standard attribute redeclares that one, which is how a
 * pool makes `email` required, and a declaration naming anything else becomes
 * a `custom:` attribute of the pool's own.
 *
 * The schema is what every write of a user attribute is checked against, so an
 * attribute no schema declares is refused where it was written rather than
 * stored and read back by an application that expected Cognito to have kept
 * it.
 *
 * A pool's schema is fixed once the pool exists. Real Cognito adds to it with
 * `AddCustomAttributes` and has no `UpdateUserPool` input for it at all, so an
 * update carries the schema across rather than replacing it.
 */
export class SimCognitoUserPoolSchema {
  private readonly byName = new Map<string, SimCognitoSchemaAttribute>();

  /**
   * The names the request declared, which is what a repeated declaration is
   * caught by: the standard attributes are held before any of them and are
   * there to be redeclared rather than to collide with one.
   */
  private readonly declaredNames = new Set<string>();

  constructor(declared?: readonly SimCognitoSchemaAttributeType[]) {
    for (const standard of simCognitoStandardAttributes) {
      this.hold(
        new SimCognitoSchemaAttribute({ declared: standard, custom: false }),
      );
    }

    if (declared === undefined) {
      return;
    }

    SimCognitoUserPoolSchema.requireDeclarableList(declared);

    for (const attribute of declared) {
      this.declare(attribute);
    }
  }

  /**
   * Refuse a `Schema` of a length Cognito would not take.
   *
   * A request declaring an empty list is refused rather than treated as a
   * request declaring nothing, because real Cognito refuses one: a `Schema`
   * built from an application's own configuration and left empty fails on the
   * way to AWS, and it should fail here first.
   */
  private static requireDeclarableList(
    declared: readonly SimCognitoSchemaAttributeType[],
  ): void {
    if (declared.length === 0 || declared.length > maxSchemaAttributes) {
      throw new SimCognitoInvalidParameterException(
        `Schema declares ${String(declared.length)} attributes: Cognito takes ` +
          `between 1 and ${String(maxSchemaAttributes)} of them in one ` +
          `CreateUserPool request`,
      );
    }
  }

  /**
   * The `custom:` attributes this pool declared, in declaration order.
   */
  get customNames(): readonly string[] {
    return this.attributes
      .filter((attribute) => !isSimCognitoStandardAttribute(attribute.name))
      .map((attribute) => attribute.name);
  }

  /**
   * The attributes a user cannot be created without.
   *
   * `sub` is not among them although the schema reports it as required:
   * Cognito allocates one for every user, so nothing is ever created without
   * it and no request may send it.
   */
  get requiredNames(): readonly string[] {
    return this.attributes
      .filter((attribute) => attribute.required && attribute.name !== "sub")
      .map((attribute) => attribute.name);
  }

  /**
   * Whether this schema holds an attribute of that name.
   */
  holds(name: string): boolean {
    return this.byName.has(name);
  }

  /**
   * The attribute of that name, or nothing where the schema does not hold it.
   */
  find(name: string): SimCognitoSchemaAttribute | undefined {
    return this.byName.get(name);
  }

  /**
   * Say, for a refusal, what a pool holding no custom attributes at all does.
   *
   * This is the sentence that tells a caller whether it declared the attribute
   * under a different name or never declared it, which is the difference
   * between the two mistakes that reach this refusal.
   */
  describeHolding(): string {
    const custom = this.customNames;

    if (custom.length === 0) {
      return (
        "the pool holds the standard attributes only, because its " +
        "CreateUserPool request declared no Schema of its own"
      );
    }

    return `the pool's schema declares ${custom.join(", ")}`;
  }

  /**
   * Refuse a user created without an attribute the schema requires.
   *
   * Real Cognito refuses `SignUp` and `AdminCreateUser` the same way, so a
   * pool whose `Schema` made an attribute required is one an application has
   * to send that attribute to here as well.
   */
  requireEveryRequired(held: ReadonlySet<string>): void {
    const missing = this.requiredNames.filter((name) => !held.has(name));

    if (missing.length === 0) {
      return;
    }

    throw new SimCognitoInvalidParameterException(
      `User attributes ${missing.join(", ")} are required by the pool's ` +
        `schema, and this user is being created without them`,
    );
  }

  /**
   * This schema as `DescribeUserPool` reports it, standard attributes first.
   */
  toOutput(): readonly SimCognitoSchemaAttributeType[] {
    return this.attributes.map((attribute) => attribute.toOutput());
  }

  private get attributes(): readonly SimCognitoSchemaAttribute[] {
    return this.byName.values().toArray();
  }

  /**
   * Take on one attribute a `Schema` declared.
   *
   * A name the same request already declared is refused, whether it is a
   * custom attribute or a standard one being redeclared: taking the last of
   * them would deploy a pool holding something the request did not plainly
   * ask for.
   */
  private declare(declared: SimCognitoSchemaAttributeType): void {
    const custom = !isSimCognitoStandardAttribute(declared.Name ?? "");
    const attribute = new SimCognitoSchemaAttribute({ declared, custom });

    if (this.declaredNames.has(attribute.name)) {
      throw new SimCognitoInvalidParameterException(
        `Schema attribute '${attribute.name}' is declared twice: a pool holds ` +
          `one attribute of each name`,
      );
    }

    this.declaredNames.add(attribute.name);
    this.hold(attribute);
  }

  private hold(attribute: SimCognitoSchemaAttribute): void {
    this.byName.set(attribute.name, attribute);
  }
}
