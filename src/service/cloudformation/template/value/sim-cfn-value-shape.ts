import { isRecord } from "../../../../util/type-guard/record.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "./sim-cfn-template-value.js";

/**
 * Builds the error a value read out of a template is refused with.
 *
 * The caller supplies this so the refusal names the Resource and the property
 * it came from, in wording sim CloudFormation does not downgrade to a skip.
 */
export type SimCfnValueShapeErrorBuilder = (reason: string) => Error;

/**
 * The shape checks a template property is read through.
 *
 * A template is JSON, so a property can be anything, while the request it
 * becomes has a shape. These are the four questions that gets asked, each
 * naming what was wrong through the error the reader was built with.
 */
export class SimCfnValueShape {
  private readonly error: SimCfnValueShapeErrorBuilder;

  constructor(error: SimCfnValueShapeErrorBuilder) {
    this.error = error;
  }

  /**
   * Read a property the template need not carry, leaving it out when it does
   * not.
   */
  present<T>(
    value: SimCfnTemplateValue | undefined,
    read: (value: SimCfnTemplateValue) => T,
  ): T | undefined {
    if (value === undefined) {
      return undefined;
    }

    return read(value);
  }

  /**
   * A value that has to be an object.
   */
  record(
    value: SimCfnTemplateValue | undefined,
    name: string,
  ): SimCfnTemplateValueRecord {
    if (!isTemplateRecord(value)) {
      throw this.error(`${name} must be an object`);
    }

    return value;
  }

  /**
   * A value that has to be a list.
   */
  list(value: SimCfnTemplateValue, name: string): SimCfnTemplateValue[] {
    if (!Array.isArray(value)) {
      throw this.error(`${name} must be a list`);
    }

    return value;
  }

  /**
   * An object that may only carry the names given.
   *
   * A name the reader has no behaviour for is refused rather than ignored. A
   * dropped name is the failure worth avoiding: the Resource deploys, and the
   * thing the template asked for is silently not there.
   */
  knownKeys(
    record: SimCfnTemplateValueRecord,
    known: ReadonlySet<string>,
    name: string,
  ): void {
    for (const key of Object.keys(record)) {
      if (!known.has(key)) {
        throw this.error(
          `${key} is not a ${name} property this simulation reads, so it is ` +
            "refused rather than ignored",
        );
      }
    }
  }

  /**
   * A value that has to be a string.
   */
  string(value: SimCfnTemplateValue, name: string): string {
    if (typeof value !== "string") {
      throw this.error(`${name} must be a string`);
    }

    return value;
  }
}

/**
 * Whether a template value is an object rather than a list or a primitive.
 */
function isTemplateRecord(
  value: SimCfnTemplateValue | undefined,
): value is SimCfnTemplateValueRecord {
  return isRecord(value);
}
