import {
  SimSsmUnsupportedParameterType,
  SimSsmValidationException,
} from "../error/sim-ssm.error.js";

/**
 * The parameter types this simulation stores.
 */
export type SimSsmParameterTypeName = "String" | "StringList" | "SecureString";

const simulatedTypes: ReadonlySet<string> = new Set([
  "String",
  "StringList",
  "SecureString",
]);

/**
 * The type of one simulated parameter.
 *
 * A `SecureString` is encrypted through simulated KMS rather than stored in
 * the clear, so the two failures a real deployment hits are reproducible here:
 * a caller that may read the parameter but may not decrypt with its key, and
 * a read that forgets `WithDecryption` and gets a ciphertext back.
 */
export class SimSsmParameterType {
  public readonly value: SimSsmParameterTypeName;

  constructor(type: string) {
    this.value = SimSsmParameterType.validated(type);
  }

  /**
   * Read the type a new parameter is created with.
   *
   * Parameter Store requires a type when a parameter is created and allows it
   * to be left out when one is updated.
   */
  static forNewParameter(type: string | undefined): SimSsmParameterType {
    if (type === undefined) {
      throw new SimSsmValidationException(
        "A parameter Type is required when creating a parameter",
      );
    }

    return new SimSsmParameterType(type);
  }

  private static validated(type: string): SimSsmParameterTypeName {
    if (!simulatedTypes.has(type)) {
      throw new SimSsmUnsupportedParameterType(
        `Parameter type '${type}' is not a Parameter Store type: use String, ` +
          `StringList or SecureString`,
      );
    }

    return type as SimSsmParameterTypeName;
  }

  /**
   * Whether values of this type are stored encrypted.
   */
  get isSecure(): boolean {
    return this.value === "SecureString";
  }
}
