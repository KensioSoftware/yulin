import {
  SimSsmUnsupportedParameterType,
  SimSsmValidationException,
} from "../error/sim-ssm.error.js";

/**
 * The parameter types this simulation stores.
 */
export type SimSsmParameterTypeName = "String" | "StringList";

const simulatedTypes: ReadonlySet<string> = new Set(["String", "StringList"]);

/**
 * The type of one simulated parameter.
 *
 * `SecureString` is refused rather than stored. Nothing in this simulation
 * would encrypt it, so accepting it would let a test pass while proving
 * nothing about the KMS key, the `kms:Decrypt` permission or the
 * `WithDecryption` flag a real deployment depends on.
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
    if (type === "SecureString") {
      throw new SimSsmUnsupportedParameterType(
        "SecureString parameters are not simulated: nothing here would " +
          "encrypt the value, so a passing test would say nothing about the " +
          "KMS key or the kms:Decrypt permission the real parameter needs. " +
          "Use String or StringList.",
      );
    }

    if (!simulatedTypes.has(type)) {
      throw new SimSsmUnsupportedParameterType(
        `Parameter type '${type}' is not a Parameter Store type: use String ` +
          `or StringList`,
      );
    }

    return type as SimSsmParameterTypeName;
  }
}
