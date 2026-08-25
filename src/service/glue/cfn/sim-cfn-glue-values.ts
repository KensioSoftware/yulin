import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnValueShape } from "../../cloudformation/template/value/sim-cfn-value-shape.js";

/**
 * The template values a Glue Resource is read out of.
 *
 * Wraps the shared shape checks with the ones every Glue property reader
 * needs, so a reader is the properties it knows about rather than the type
 * narrowing around them.
 */
export class SimCfnGlueValues {
  readonly shape: SimCfnValueShape;
  readonly refuse: (reason: string) => Error;

  constructor(refuse: (reason: string) => Error) {
    this.refuse = refuse;
    this.shape = new SimCfnValueShape(refuse);
  }

  /** A value that has to be an object. */
  record(
    value: SimCfnTemplateValue | undefined,
    path: string,
  ): SimCfnTemplateValueRecord {
    return this.shape.record(value, path);
  }

  /** A value that has to be a list. */
  list(value: SimCfnTemplateValue, path: string): SimCfnTemplateValue[] {
    return this.shape.list(value, path);
  }

  /** A value that has to be a string. */
  string(value: SimCfnTemplateValue, path: string): string {
    return this.shape.string(value, path);
  }

  /** A string the template need not carry. */
  optionalString(
    value: SimCfnTemplateValue | undefined,
    path: string,
  ): string | undefined {
    return this.shape.present(value, (present) => this.string(present, path));
  }

  /** A boolean the template need not carry. */
  optionalBoolean(
    value: SimCfnTemplateValue | undefined,
    path: string,
  ): boolean | undefined {
    return this.shape.present(value, (present) => {
      if (typeof present !== "boolean") {
        throw this.refuse(`${path} must be a boolean`);
      }

      return present;
    });
  }

  /** A number the template need not carry. */
  optionalNumber(
    value: SimCfnTemplateValue | undefined,
    path: string,
  ): number | undefined {
    return this.shape.present(value, (present) => {
      if (typeof present !== "number") {
        throw this.refuse(`${path} must be a number`);
      }

      return present;
    });
  }

  /**
   * A string-to-string map the template need not carry.
   *
   * Table parameters carry Athena partition projection, so this is the reader
   * standing between a declared `projection.enabled` and a table that has one.
   *
   * A number or a boolean becomes its text, which is what CloudFormation does
   * with a primitive bound to a String property. An unquoted
   * `projection.enabled: true` in a YAML template is a boolean by the time it
   * reaches here, and real Glue receives `"true"` from it.
   */
  optionalParameters(
    value: SimCfnTemplateValue | undefined,
    path: string,
  ): Readonly<Record<string, string>> | undefined {
    return this.shape.present(value, (present) =>
      Object.fromEntries(
        Object.entries(this.record(present, path)).map(([key, entry]) => [
          key,
          this.#parameter(entry, `${path}.${key}`),
        ]),
      ),
    );
  }

  #parameter(value: SimCfnTemplateValue, path: string): string {
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    return this.string(value, path);
  }
}
