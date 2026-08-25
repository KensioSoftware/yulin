import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnGlueValues } from "./sim-cfn-glue-values.js";

/**
 * One object out of a template, read by property name.
 *
 * A reader working straight off the record repeats the key three times per
 * property, once to index with and twice to build the path a refusal names.
 * This holds the properties and the path so a property is its name and its
 * type.
 *
 * The properties are held as a Map. A template is user input, so the key being
 * looked up is user input too, and a Map has no prototype for one of them to
 * reach.
 */
export class SimCfnGlueRecord {
  readonly values: SimCfnGlueValues;
  readonly path: string;

  readonly #entries: ReadonlyMap<string, SimCfnTemplateValue>;

  constructor(
    values: SimCfnGlueValues,
    record: SimCfnTemplateValueRecord,
    path: string,
  ) {
    this.values = values;
    this.path = path;
    this.#entries = new Map(Object.entries(record));
  }

  /** The property names this object carries. */
  keys(): readonly string[] {
    return this.#entries.keys().toArray();
  }

  /** A string property, absent when the template leaves it out. */
  string(key: string): string | undefined {
    return this.values.optionalString(this.#entries.get(key), this.#at(key));
  }

  /** A boolean property, absent when the template leaves it out. */
  boolean(key: string): boolean | undefined {
    return this.values.optionalBoolean(this.#entries.get(key), this.#at(key));
  }

  /** A number property, absent when the template leaves it out. */
  number(key: string): number | undefined {
    return this.values.optionalNumber(this.#entries.get(key), this.#at(key));
  }

  /** A string-to-string map, absent when the template leaves it out. */
  parameters(key: string): Readonly<Record<string, string>> | undefined {
    return this.values.optionalParameters(
      this.#entries.get(key),
      this.#at(key),
    );
  }

  /** A property read by something else, absent when it is left out. */
  read<T>(
    key: string,
    read: (value: SimCfnTemplateValue, path: string) => T,
  ): T | undefined {
    const value = this.#entries.get(key);

    return value === undefined ? undefined : read(value, this.#at(key));
  }

  /** A property the Resource cannot be created without. */
  required(key: string): SimCfnTemplateValue {
    const value = this.#entries.get(key);

    if (value === undefined) {
      throw this.values.refuse(`${this.#at(key)} is required`);
    }

    return value;
  }

  /** A nested object, read by property name in its turn. */
  nested(value: SimCfnTemplateValue, path: string): SimCfnGlueRecord {
    return new SimCfnGlueRecord(
      this.values,
      this.values.record(value, path),
      path,
    );
  }

  #at(key: string): string {
    return `${this.path}.${key}`;
  }
}
