import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnValueShape } from "../../../cloudformation/template/value/sim-cfn-value-shape.js";
import type { SimCloudWatchDimensionInput } from "../../metric/sim-cloudwatch-dimension.js";

/** The two halves of an AWS::CloudWatch::Alarm Dimension entry. */
const dimensionKeys = new Set(["Name", "Value"]);

/**
 * A refusal naming the Resource whose properties could not be read.
 */
export function alarmPropertyError(logicalId: string, reason: string): Error {
  return new Error(
    `Invalid sim CloudWatch CloudFormation Resource ${logicalId}: ${reason}`,
  );
}

interface SimCfnAlarmValuesProperties {
  readonly logicalId: string;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads the shapes an AWS::CloudWatch::Alarm property can take.
 *
 * Only the template's own shape is checked here: a number where a number
 * belongs, a list where a list belongs. What a value is allowed to mean is left
 * to PutMetricAlarm, so an alarm a template declared is refused in the same
 * words as one an SDK caller asked for.
 */
export class SimCfnAlarmValues {
  readonly #logicalId: string;
  readonly #entries: ReadonlyMap<string, SimCfnTemplateValue>;
  readonly #shape: SimCfnValueShape;

  constructor(properties: SimCfnAlarmValuesProperties) {
    this.#logicalId = properties.logicalId;
    this.#entries = new Map(Object.entries(properties.properties));
    this.#shape = new SimCfnValueShape((reason) =>
      alarmPropertyError(this.#logicalId, reason),
    );
  }

  /**
   * A property holding a string, where the template may leave it out.
   */
  string(name: string): string | undefined {
    return this.#shape.present(this.#entries.get(name), (value) =>
      this.#shape.string(value, name),
    );
  }

  /**
   * A property holding a list of strings, such as one of the action lists.
   */
  strings(name: string): readonly string[] | undefined {
    return this.#shape.present(this.#entries.get(name), (value) =>
      this.#shape
        .list(value, name)
        .map((entry, index) =>
          this.#shape.string(entry, `${name}.${index.toString()}`),
        ),
    );
  }

  /**
   * A property holding a list, handed on for another reader to refuse.
   */
  list(name: string): readonly SimCfnTemplateValue[] | undefined {
    return this.#shape.present(this.#entries.get(name), (value) =>
      this.#shape.list(value, name),
    );
  }

  /**
   * A property holding a number.
   *
   * CloudFormation carries template numbers as strings in places, a Parameter
   * value most of all, so a string holding a number is read as that number.
   */
  number(name: string): number | undefined {
    return this.#shape.present(this.#entries.get(name), (value) => {
      const parsed = typeof value === "string" ? numberHeldBy(value) : value;

      if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
        throw alarmPropertyError(this.#logicalId, `${name} must be a number`);
      }

      return parsed;
    });
  }

  /**
   * A property holding a boolean, in either of the forms CloudFormation
   * carries one.
   */
  boolean(name: string): boolean | undefined {
    return this.#shape.present(this.#entries.get(name), (value) => {
      if (typeof value === "boolean") {
        return value;
      }

      if (value === "true" || value === "false") {
        return value === "true";
      }

      throw alarmPropertyError(this.#logicalId, `${name} must be a boolean`);
    });
  }

  /**
   * The dimensions narrowing which metric the alarm watches.
   *
   * A key that is not `Name` or `Value` is refused rather than dropped: a
   * misspelled half of a dimension would otherwise leave the alarm watching a
   * different metric from the one the template meant.
   */
  dimensions(): readonly SimCloudWatchDimensionInput[] | undefined {
    return this.list("Dimensions")?.map((entry, index) => {
      const path = `Dimensions.${index.toString()}`;
      const dimension = this.#shape.record(entry, path);

      this.#shape.knownKeys(dimension, dimensionKeys, "Dimension");

      return {
        Name: this.#shape.present(dimension["Name"], (value) =>
          this.#shape.string(value, `${path}.Name`),
        ),
        Value: this.#shape.present(dimension["Value"], (value) =>
          this.#shape.string(value, `${path}.Value`),
        ),
      };
    });
  }
}

/**
 * The number a template string holds, or NaN where it holds none.
 *
 * An empty string is not a zero, though `Number("")` is: a Parameter that
 * arrived empty would otherwise deploy an alarm with a threshold of nought,
 * which is a threshold nearly everything breaches.
 */
function numberHeldBy(value: string): number {
  const trimmed = value.trim();

  return trimmed === "" ? NaN : Number(trimmed);
}
