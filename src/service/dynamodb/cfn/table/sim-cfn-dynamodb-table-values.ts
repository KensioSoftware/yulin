import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { dynamoDbTablePropertyError } from "./sim-cfn-dynamodb-table-property-rules.js";

interface SimCfnDynamoDbTableValuesProperties {
  readonly logicalId: string;
  readonly properties: SimCfnTemplateValueRecord;
  readonly path?: string;
}

/**
 * Reads the plain shapes an AWS::DynamoDB::Table property can hold.
 *
 * Only the template's own shape is checked here: a list where a list belongs, a
 * number where a number belongs. What a value is allowed to mean is left to
 * CreateTable.
 *
 * A nested object or list entry is read through a reader of its own, carrying
 * the path it sits at, so a refusal names the whole property path it came from
 * rather than just the field.
 */
export class SimCfnDynamoDbTableValues {
  private readonly logicalId: string;
  private readonly entries: ReadonlyMap<string, SimCfnTemplateValue>;
  private readonly path: string;

  constructor(properties: SimCfnDynamoDbTableValuesProperties) {
    this.logicalId = properties.logicalId;
    this.entries = new Map(Object.entries(properties.properties));
    this.path = properties.path ?? "";
  }

  /**
   * Read a property holding a list of objects, such as a key schema.
   *
   * A property the template leaves out reads as no entries, which is what
   * CreateTable then refuses in its own words.
   */
  list(name: string): readonly SimCfnDynamoDbTableValues[] {
    const value = this.entries.get(name);

    if (value === undefined) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw this.error(`${this.at(name)} must be a list`);
    }

    return value.map((element, index) => {
      return this.reader(element, `${this.at(name)}.${index.toString()}`);
    });
  }

  /**
   * Read a property holding an object, where the template may leave it out.
   */
  object(name: string): SimCfnDynamoDbTableValues | undefined {
    const value = this.entries.get(name);

    if (value === undefined) {
      return undefined;
    }

    return this.reader(value, this.at(name));
  }

  /**
   * Read a property holding a string, where the template may leave it out.
   */
  string(name: string): string | undefined {
    const value = this.entries.get(name);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw this.error(`${this.at(name)} must be a string`);
    }

    return value;
  }

  /**
   * Read a property holding a number.
   *
   * CloudFormation carries a number as a string when it came from a template
   * Parameter, so both are read.
   */
  number(name: string): number | undefined {
    const value = this.entries.get(name);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);

      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    throw this.error(`${this.at(name)} must be a number`);
  }

  /**
   * Read a property holding a boolean.
   *
   * CloudFormation carries a boolean as a string when it came from a template
   * Parameter, so both are read. Anything else is refused rather than read as
   * false, since what the template asked for is not knowable.
   */
  boolean(name: string): boolean | undefined {
    const value = this.entries.get(name);

    if (value === undefined) {
      return undefined;
    }

    if (value === true || value === "true") {
      return true;
    }

    if (value === false || value === "false") {
      return false;
    }

    throw this.error(`${this.at(name)} must be true or false`);
  }

  /**
   * Build the error this Resource is refused with.
   */
  error(reason: string): Error {
    return dynamoDbTablePropertyError(this.logicalId, reason);
  }

  /**
   * A reader over a nested value, refusing one that is not an object.
   */
  private reader(
    value: SimCfnTemplateValue,
    path: string,
  ): SimCfnDynamoDbTableValues {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw this.error(`${path} must be an object`);
    }

    return new SimCfnDynamoDbTableValues({
      logicalId: this.logicalId,
      properties: value,
      path,
    });
  }

  /**
   * The whole path a property sits at, for a refusal to name.
   */
  private at(name: string): string {
    if (this.path === "") {
      return name;
    }

    return `${this.path}.${name}`;
  }
}
