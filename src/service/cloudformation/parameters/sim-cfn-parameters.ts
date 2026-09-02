import { simCfnParameterDefinitions } from "./sim-cfn-parameter-definitions.js";
import { simCfnParameterInputValues } from "./sim-cfn-parameter-input-values.js";
import { SimCfnParameterValues } from "./sim-cfn-parameter-values.js";
import type { SimCfnIgnoredProperty } from "../resource/ignore/sim-cfn-ignored-property.type.js";
import type {
  SimCfnParameterDefinition,
  SimCfnParametersContext,
  SimCfnParametersProperties as SimCfnParametersProperties,
  SimCloudFormationParameterInput,
  SimCloudFormationParameterValue,
  SimCloudFormationParameterValues,
} from "./sim-cfn-parameters.type.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

/**
 * Resolves CloudFormation Parameters for a simulated Stack.
 *
 * This class keeps the template Parameter definitions and the runtime Parameter
 * values together. Values supplied by command input take precedence, then any
 * missing values are filled from string defaults in the template definitions.
 *
 * A Parameter declared as an `AWS::SSM::Parameter::Value<...>` type is given a
 * parameter name either way, and the value it resolves to is the one simulated
 * Parameter Store holds under that name.
 */
export class SimCfnParameters {
  private readonly definitions: ReadonlyMap<string, SimCfnParameterDefinition>;
  private readonly values: SimCfnParameterValues;
  private readonly supplied: ReadonlyMap<string, string>;
  private readonly properties: SimCfnParametersProperties;

  constructor(properties: SimCfnParametersProperties = {}) {
    this.properties = properties;
    this.definitions = simCfnParameterDefinitions(properties);
    this.supplied = new Map(Object.entries(properties.values ?? {}));
    this.values = new SimCfnParameterValues({
      definitions: this.definitions,
      supplied: properties.values ?? {},
      store: properties.parameterStore,
    });
  }

  /**
   * Create Parameters from a CloudFormation command-like input object.
   */
  static fromInput(
    input: SimCloudFormationParameterInput,
    properties: SimCfnParametersContext = {},
  ): SimCfnParameters {
    return new SimCfnParameters({
      ...properties,
      values: simCfnParameterInputValues(input),
    });
  }

  /**
   * Create Parameters from already-normalized values.
   *
   * This is useful for tests and internal callers that already have a plain
   * Parameter-name-to-value record and do not need AWS command input
   * conversion.
   */
  static fromValues(
    values: SimCloudFormationParameterValues,
    properties: SimCfnParametersContext = {},
  ): SimCfnParameters {
    return new SimCfnParameters({
      ...properties,
      values,
    });
  }

  /**
   * Return a copy of this Parameters wrapper with template definitions
   * attached.
   *
   * Template parsing can happen after command input normalization, so this
   * keeps existing explicit values while adding the definitions needed for
   * presence checks and default-value resolution.
   */
  withDefinitions(
    definitions: Record<string, SimCfnParameterDefinition> | undefined,
  ): SimCfnParameters {
    return new SimCfnParameters({ ...this.properties, definitions });
  }

  /**
   * Whether the template declares a Parameter with this name.
   *
   * This checks definitions only. A Parameter can be declared even when no
   * runtime value has been supplied or defaulted.
   */
  has(parameterName: string): boolean {
    return this.definitions.has(parameterName);
  }

  /**
   * The value a command supplied for this Parameter, if it supplied one.
   *
   * What `UsePreviousValue` on an UpdateStack Parameter reads off the Stack.
   * A Parameter the Stack was deployed without has nothing here, and takes the
   * template Default again as it did the first time.
   */
  suppliedValue(parameterName: string): string | undefined {
    return this.supplied.get(parameterName);
  }

  /**
   * Resolve the runtime value for a declared or referenced Parameter.
   *
   * The returned value may have come from command input, from a string Default
   * in the template definition, or from simulated Parameter Store. Missing
   * values are treated as template/runtime errors because a Ref to a Parameter
   * must resolve to a concrete value.
   */
  value(parameterName: string): SimCloudFormationParameterValue {
    const value = this.values.get(parameterName);
    assertDefined(
      value,
      `Sim CloudFormation Stack ${this.properties.stackName ?? "unknown"} parameter ${parameterName} is missing a value`,
    );

    return value;
  }

  /**
   * Every Parameter that resolved to a stand-in value, and why.
   *
   * A Stack reports these alongside the properties its Resources were created
   * without, since a Parameter holding a stand-in leaves every Resource that
   * reads it configured with a value the template never asked for.
   */
  public get ignoredProperties(): readonly SimCfnIgnoredProperty[] {
    return this.values.ignoredProperties;
  }
}
