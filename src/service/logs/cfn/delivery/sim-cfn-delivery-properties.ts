import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * A refusal naming the Resource whose properties could not be read.
 */
export function deliveryPropertyError(
  logicalId: string,
  reason: string,
): Error {
  return new Error(
    `Invalid sim CloudWatch Logs CloudFormation Resource ${logicalId}: ${reason}`,
  );
}

interface SimCfnDeliveryPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
  readonly resourceType: string;

  /** The properties this Resource type is actually created from. */
  readonly actedOnProperties: ReadonlySet<string>;

  /** The real properties this simulation has nothing to act on, and why. */
  readonly unsimulatedReasons: ReadonlyMap<string, string>;
}

/**
 * Reads the CloudFormation properties of a delivery Resource.
 *
 * The three delivery Resource types read a handful of strings, a boolean and a
 * list of strings between them, so one reader serves all three rather than
 * each carrying a near identical copy. What differs between them is which
 * property names it acts on, and that is passed in.
 */
export class SimCfnDeliveryProperties {
  readonly #resource: SimCfnResource;
  readonly #resourceType: string;
  readonly #actedOnProperties: ReadonlySet<string>;
  readonly #unsimulatedReasons: ReadonlyMap<string, string>;

  /**
   * The template's properties, keyed for reading by name.
   *
   * A map rather than the record they arrived in, because every read here
   * names a property the Resource type decided on and a template's keys are
   * whatever it happened to carry.
   */
  readonly #values: ReadonlyMap<string, SimCfnTemplateValue>;

  constructor(properties: SimCfnDeliveryPropertiesProperties) {
    this.#resource = properties.resource;
    this.#resourceType = properties.resourceType;
    this.#actedOnProperties = properties.actedOnProperties;
    this.#unsimulatedReasons = properties.unsimulatedReasons;
    this.#values = new Map(Object.entries(properties.properties));
  }

  /**
   * A property the Resource cannot be created without.
   */
  requiredString(name: string): string {
    const value = this.optionalString(name);

    if (value === undefined) {
      throw deliveryPropertyError(
        this.#resource.logicalId,
        `${name} is required on ${this.#resourceType}`,
      );
    }

    return value;
  }

  /**
   * A string property, or undefined where the template leaves it out.
   */
  optionalString(name: string): string | undefined {
    const value = this.#values.get(name);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw deliveryPropertyError(
        this.#resource.logicalId,
        `${name} must be a string`,
      );
    }

    return value;
  }

  /**
   * A boolean property, or undefined where the template leaves it out.
   */
  optionalBoolean(name: string): boolean | undefined {
    const value = this.#values.get(name);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "boolean") {
      throw deliveryPropertyError(
        this.#resource.logicalId,
        `${name} must be a boolean`,
      );
    }

    return value;
  }

  /**
   * A list of strings property, or undefined where the template leaves it out.
   */
  optionalStringList(name: string): readonly string[] | undefined {
    const value = this.#values.get(name);

    if (value === undefined) {
      return undefined;
    }

    if (
      !Array.isArray(value) ||
      value.some((entry) => typeof entry !== "string")
    ) {
      throw deliveryPropertyError(
        this.#resource.logicalId,
        `${name} must be a list of strings`,
      );
    }

    return value as readonly string[];
  }

  /**
   * Record every property the Resource is created without acting on.
   */
  recordIgnoredProperties(): void {
    for (const name of this.#values.keys()) {
      this.recordIgnoredProperty(name);
    }
  }

  private recordIgnoredProperty(name: string): void {
    if (this.#actedOnProperties.has(name)) {
      return;
    }

    const unsimulatedReason = this.#unsimulatedReasons.get(name);

    if (unsimulatedReason === undefined) {
      this.#resource.ignoreProperty(
        name,
        `${name} is not a property simulated CloudWatch Logs knows about, ` +
          `so the Resource is created without it`,
      );

      return;
    }

    this.#resource.ignoreProperty(
      name,
      `${name} is a real ${this.#resourceType} property simulated CloudWatch ` +
        `Logs does not act on: ${unsimulatedReason}`,
    );
  }
}
