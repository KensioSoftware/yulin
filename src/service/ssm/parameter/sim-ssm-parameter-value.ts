import { SimSsmValidationException } from "../error/sim-ssm.error.js";

/**
 * The content size a standard tier parameter may hold.
 *
 * This is the limit people actually hit, usually by putting a whole JSON
 * configuration blob in one parameter. The advanced tier's 8KB is not
 * simulated, so this is the only limit here.
 */
const maxValueBytes = 4096;

/**
 * The value held by one version of a simulated parameter, as it is stored.
 *
 * A `StringList` value is a single comma-separated string here, as it is on
 * real Parameter Store. It is stored and returned that way rather than split
 * into an array, so handler code that splits it on commas is exercising the
 * same shape it would get from AWS.
 *
 * A `SecureString` value is stored as the base64 ciphertext KMS produced,
 * which is what a read without `WithDecryption` returns. The 4KB limit applies
 * to the plaintext a request submitted rather than to that ciphertext, so the
 * two ways of making one of these are separate.
 */
export class SimSsmParameterValue {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * The value a request submitted, checked against the standard tier limit.
   */
  static submitted(value: string | undefined): SimSsmParameterValue {
    if (value === undefined || value === "") {
      throw new SimSsmValidationException(
        "A parameter Value is required and cannot be empty",
      );
    }

    const byteLength = Buffer.byteLength(value, "utf8");

    if (byteLength > maxValueBytes) {
      throw new SimSsmValidationException(
        `Parameter value is ${String(byteLength)} bytes; a standard tier ` +
          `parameter holds at most ${String(maxValueBytes)} bytes. The ` +
          `advanced tier is not simulated.`,
      );
    }

    return new SimSsmParameterValue(value);
  }

  /**
   * The stored form of an encrypted value.
   *
   * This is longer than the plaintext it came from and is not subject to the
   * limit that plaintext was checked against, because Parameter Store measures
   * the request rather than what it keeps.
   */
  static encrypted(ciphertext: string): SimSsmParameterValue {
    return new SimSsmParameterValue(ciphertext);
  }
}
