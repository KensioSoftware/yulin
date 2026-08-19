import { SimCfnIgnoredProperties } from "../../resource/ignore/sim-cfn-ignored-properties.js";
import type { SimCfnIgnoredProperty } from "../../resource/ignore/sim-cfn-ignored-property.type.js";
import type {
  SimCfnParameterDefinition,
  SimCloudFormationParameterValue,
} from "../sim-cfn-parameters.type.js";
import type { SimCfnParameterStoreReader } from "./sim-cfn-parameter-store.type.js";
import {
  simCfnParameterStoreValueType,
  type SimCfnParameterStoreValueType,
} from "./sim-cfn-parameter-store-value-type.js";

interface SimCfnParameterStoreValuesProperties {
  readonly store?: SimCfnParameterStoreReader | undefined;
}

/** What one Parameter was given, and the value type it was declared as. */
interface SimCfnParameterStoreName {
  readonly parameterName: string;
  readonly definition: SimCfnParameterDefinition;
  readonly name: string;
  readonly valueType: SimCfnParameterStoreValueType;
}

/**
 * The template Parameters whose value comes from Parameter Store.
 *
 * A Parameter declared as `AWS::SSM::Parameter::Value<String>` is given a
 * parameter name, and resolves to the value held under it. A `List<...>` inner
 * type resolves to the stored string split on commas, which is the shape
 * `Fn::Select` and the other list functions take.
 *
 * A name the store cannot answer resolves to a stand-in value, and the
 * substitution is recorded here for the Stack to report. The record is what
 * makes the stand-in findable. A Parameter holding one leaves every Resource
 * that read it configured with a value the template never asked for.
 */
export class SimCfnParameterStoreValues {
  private readonly store: SimCfnParameterStoreReader | undefined;
  private readonly ignored = new SimCfnIgnoredProperties();

  constructor(properties: SimCfnParameterStoreValuesProperties = {}) {
    this.store = properties.store;
  }

  /** Every Parameter that resolved to a stand-in value. */
  public get ignoredProperties(): readonly SimCfnIgnoredProperty[] {
    return this.ignored.all;
  }

  /**
   * Replace the name each Parameter Store value type Parameter was given with
   * the value the store holds under it.
   *
   * Nothing is replaced where there is no store to read. A Parameters wrapper
   * built outside a simulation has no Parameter Store behind it, and the name
   * it was given stands as its value.
   */
  applyTo(
    values: Map<string, SimCloudFormationParameterValue>,
    definitions: ReadonlyMap<string, SimCfnParameterDefinition>,
  ): void {
    const store = this.store;

    if (store === undefined) {
      return;
    }

    for (const named of this.named(values, definitions)) {
      values.set(named.parameterName, this.read(store, named));
    }
  }

  /**
   * The Parameters that name a Parameter Store value, and what they name.
   *
   * A Parameter with no value at all is left out. A `Ref` to one is refused
   * where it is read, as a Parameter of any other type with no value is.
   */
  private *named(
    values: ReadonlyMap<string, SimCloudFormationParameterValue>,
    definitions: ReadonlyMap<string, SimCfnParameterDefinition>,
  ): Generator<SimCfnParameterStoreName> {
    for (const [parameterName, definition] of definitions) {
      const name = values.get(parameterName);
      const valueType = simCfnParameterStoreValueType(definition.Type);

      if (valueType !== undefined && typeof name === "string") {
        yield { parameterName, definition, name, valueType };
      }
    }
  }

  /**
   * Read the value one Parameter's name is held against.
   */
  private read(
    store: SimCfnParameterStoreReader,
    named: SimCfnParameterStoreName,
  ): SimCloudFormationParameterValue {
    const read = store.read(named.name);

    if (read.reason !== undefined) {
      this.ignored.record(
        { logicalId: named.parameterName, type: named.definition.Type },
        `Parameters.${named.parameterName}`,
        read.reason,
      );
    }

    return named.valueType.list ? read.value.split(",") : read.value;
  }
}
