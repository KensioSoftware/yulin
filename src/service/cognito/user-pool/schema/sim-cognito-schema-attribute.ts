import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import {
  simCognitoAttributeConstraintsFor,
  type SimCognitoAttributeConstraints,
  type SimCognitoAttributeConstraintsType,
} from "./sim-cognito-attribute-constraints.js";
import { SimCognitoAttributeDataType } from "./sim-cognito-attribute-data-type.js";
import {
  simCognitoDeveloperAttributePrefix,
  simCognitoSchemaAttributeName,
} from "./sim-cognito-schema-attribute-name.js";

/**
 * One attribute of a pool's schema, as a `Schema` declares it and a described
 * pool reports it.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_SchemaAttributeType.html
 */
export interface SimCognitoSchemaAttributeType extends SimCognitoAttributeConstraintsType {
  readonly Name?: string | undefined;
  readonly AttributeDataType?: string | undefined;
  readonly DeveloperOnlyAttribute?: boolean | undefined;
  readonly Mutable?: boolean | undefined;
  readonly Required?: boolean | undefined;
}

interface SimCognitoSchemaAttributeProperties {
  readonly declared: SimCognitoSchemaAttributeType;

  /**
   * Whether this is an attribute the pool declared for itself rather than one
   * of the standard set. A custom attribute is the one Cognito renames.
   */
  readonly custom: boolean;
}

/**
 * One attribute a pool's schema holds: what it is called, what it holds, and
 * whether a user can be given a second value for it.
 *
 * A declaration is checked against what real Cognito accepts rather than taken
 * as written, so a pool that could not have been created on AWS is not created
 * here. A `Required` custom attribute and a `DeveloperOnlyAttribute` are the
 * two a request most often asks for and neither Cognito nor this simulation
 * gives it.
 */
export class SimCognitoSchemaAttribute {
  /** The name this attribute is written and read under. */
  public readonly name: string;

  /** Whether a user that already has this attribute may be given another value. */
  public readonly mutable: boolean;

  /** Whether a user cannot be created without this attribute. */
  public readonly required: boolean;

  private readonly declared: SimCognitoSchemaAttributeType;
  private readonly dataType: SimCognitoAttributeDataType;
  private readonly constraints: SimCognitoAttributeConstraints;

  constructor(properties: SimCognitoSchemaAttributeProperties) {
    const { declared, custom } = properties;

    this.declared = declared;
    this.name = simCognitoSchemaAttributeName(declared.Name, custom);

    // A declaration saying nothing about either is asking for an attribute
    // that is neither mutable nor required, which is what real Cognito
    // defaults both to. A standard attribute no schema names keeps the
    // mutability the standard schema gives it.
    this.mutable = declared.Mutable ?? false;
    this.required = declared.Required ?? false;
    this.dataType = new SimCognitoAttributeDataType(
      declared.AttributeDataType,
      this.name,
    );
    this.constraints = simCognitoAttributeConstraintsFor({
      declared,
      dataType: this.dataType,
      attributeName: this.name,
    });

    if (custom) {
      this.requireCustomAttributeCognitoAllows();
    }
  }

  /**
   * Refuse a value this attribute could not hold.
   */
  requireValue(value: string): void {
    this.dataType.requireValue(this.name, value);
    this.constraints.requireValue(value);
  }

  /**
   * Refuse a second value for an attribute the schema fixed.
   *
   * Real Cognito takes an immutable attribute when the user is created and
   * refuses every write after that, which is what makes one usable as an
   * application's own identifier for the user.
   */
  requireMutable(): void {
    if (this.mutable) {
      return;
    }

    throw new SimCognitoInvalidParameterException(
      `User attribute '${this.name}' cannot be changed: the pool's schema ` +
        `declares it with Mutable false, so Cognito takes it when the user ` +
        `is created and refuses it afterwards`,
    );
  }

  /**
   * This attribute as `DescribeUserPool` reports it, under the name Cognito
   * gave it.
   */
  toOutput(): SimCognitoSchemaAttributeType {
    return {
      Name: this.name,
      AttributeDataType: this.dataType.value,
      DeveloperOnlyAttribute: this.declared.DeveloperOnlyAttribute ?? false,
      Mutable: this.mutable,
      Required: this.required,
      ...this.constraints.toOutput(),
    };
  }

  /**
   * Refuse a custom attribute real Cognito would not create.
   */
  private requireCustomAttributeCognitoAllows(): void {
    if (this.declared.DeveloperOnlyAttribute === true) {
      throw new SimCognitoInvalidParameterException(
        `Schema attribute '${this.name}' is a DeveloperOnlyAttribute, which ` +
          `is not simulated: Cognito writes one under a ` +
          `'${simCognitoDeveloperAttributePrefix}' name that only an admin ` +
          `operation can read or set`,
      );
    }

    if (this.required) {
      throw new SimCognitoInvalidParameterException(
        `Schema attribute '${this.name}' is Required, which Cognito refuses: ` +
          `only a standard attribute can be required`,
      );
    }
  }
}
