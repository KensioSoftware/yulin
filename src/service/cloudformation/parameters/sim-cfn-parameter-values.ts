import type { SimCfnIgnoredProperty } from "../resource/ignore/sim-cfn-ignored-property.type.js";
import { SimCfnParameterStoreValues } from "./store/sim-cfn-parameter-store-values.js";
import type { SimCfnParameterStoreReader } from "./store/sim-cfn-parameter-store.type.js";
import type {
  SimCfnParameterDefinition,
  SimCloudFormationParameterValue,
  SimCloudFormationParameterValues,
} from "./sim-cfn-parameters.type.js";

interface SimCfnParameterValuesProperties {
  readonly definitions: ReadonlyMap<string, SimCfnParameterDefinition>;
  readonly supplied: SimCloudFormationParameterValues;
  readonly store?: SimCfnParameterStoreReader | undefined;
}

/**
 * The runtime value of every Parameter a Stack was created with.
 *
 * Worked out in the order CloudFormation works them out. A value supplied to
 * the command wins over a template `Default`, and a Parameter declared as a
 * Parameter Store value type reads whichever of the two it ended up with as the
 * name to read.
 */
export class SimCfnParameterValues {
  private readonly values: Map<string, SimCloudFormationParameterValue>;
  private readonly storeValues: SimCfnParameterStoreValues;

  constructor(properties: SimCfnParameterValuesProperties) {
    const { definitions, supplied, store } = properties;

    this.storeValues = new SimCfnParameterStoreValues({ store });
    this.values = new Map(Object.entries(supplied));

    this.recordDefaults(definitions);
    this.storeValues.applyTo(this.values, definitions);
  }

  /** Every Parameter that resolved to a stand-in value. */
  public get ignoredProperties(): readonly SimCfnIgnoredProperty[] {
    return this.storeValues.ignoredProperties;
  }

  /**
   * The value of one Parameter, or undefined for a Parameter with no value.
   */
  get(parameterName: string): SimCloudFormationParameterValue | undefined {
    return this.values.get(parameterName);
  }

  /**
   * Fill in each Parameter that was supplied no value and declares a string
   * `Default`.
   */
  private recordDefaults(
    definitions: ReadonlyMap<string, SimCfnParameterDefinition>,
  ): void {
    for (const [parameterName, definition] of definitions) {
      const defaultValue = definition.Default;

      if (typeof defaultValue === "string" && !this.values.has(parameterName)) {
        this.values.set(parameterName, defaultValue);
      }
    }
  }
}
