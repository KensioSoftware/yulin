import type { SimCfnIgnoredProperty } from "../resource/ignore/sim-cfn-ignored-property.type.js";
import { isSimCfnParameterListType } from "./sim-cfn-parameter-list-type.js";
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
 *
 * A `CommaDelimitedList` or `List<...>` Parameter is given its value as one
 * comma-separated string, and holds it as the list of members.
 */
export class SimCfnParameterValues {
  private readonly values: Map<string, SimCloudFormationParameterValue>;
  private readonly storeValues: SimCfnParameterStoreValues;

  constructor(properties: SimCfnParameterValuesProperties) {
    const { definitions, supplied, store } = properties;

    this.storeValues = new SimCfnParameterStoreValues({ store });
    this.values = new Map(Object.entries(supplied));

    this.recordDefaults(definitions);
    this.splitLists(definitions);
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

  /**
   * Split the value of each list-typed Parameter on its commas.
   *
   * Each member is trimmed of the spaces around it, as CloudFormation trims
   * them. A value with no commas is a list of one.
   */
  private splitLists(
    definitions: ReadonlyMap<string, SimCfnParameterDefinition>,
  ): void {
    for (const [parameterName, definition] of definitions) {
      const value = this.values.get(parameterName);

      if (
        typeof value === "string" &&
        isSimCfnParameterListType(definition.Type)
      ) {
        this.values.set(
          parameterName,
          value.split(",").map((member) => member.trim()),
        );
      }
    }
  }
}
