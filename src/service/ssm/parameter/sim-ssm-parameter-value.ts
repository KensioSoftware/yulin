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
 * The value held by one version of a simulated parameter.
 *
 * A `StringList` value is a single comma-separated string here, as it is on
 * real Parameter Store. It is stored and returned that way rather than split
 * into an array, so handler code that splits it on commas is exercising the
 * same shape it would get from AWS.
 */
export class SimSsmParameterValue {
  public readonly value: string;

  constructor(value: string | undefined) {
    this.value = SimSsmParameterValue.validated(value);
  }

  private static validated(value: string | undefined): string {
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

    return value;
  }
}
