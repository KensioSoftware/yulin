import { isRecord } from "../../../util/type-guard/record.js";
import type {
  SimCfnParameterDefinition,
  SimCfnParametersProps as SimCfnParametersProperties,
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
 */
export class SimCfnParameters {
  private readonly definitions = new Map<string, SimCfnParameterDefinition>();
  private readonly values = new Map<string, SimCloudFormationParameterValue>();
  private readonly stackName: string | undefined;

  constructor(properties: SimCfnParametersProperties = {}) {
    const { definitions, values = {}, stackName } = properties;

    this.stackName = stackName;

    this.recordDefinitions(definitions);
    this.recordValues(values);
    this.recordDefaultValues();
  }

  /**
   * Create Parameters from a CloudFormation command-like input object.
   *
   * AWS command inputs carry Parameters as an array of key/value objects, while
   * this wrapper stores values in a map keyed by Parameter name. Incomplete
   * array entries are ignored because they cannot contribute a usable runtime value.
   */
  static fromInput(
    input: SimCloudFormationParameterInput,
    properties: Pick<
      SimCfnParametersProperties,
      "definitions" | "stackName"
    > = {},
  ): SimCfnParameters {
    const values: SimCloudFormationParameterValues = {};

    const inputParameters = input.Parameters ?? [];
    for (const parameter of inputParameters) {
      if (
        parameter.ParameterKey === undefined ||
        parameter.ParameterValue === undefined
      ) {
        continue;
      }

      values[parameter.ParameterKey] = parameter.ParameterValue;
    }

    return new SimCfnParameters({
      ...properties,
      values,
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
    properties: Pick<
      SimCfnParametersProperties,
      "definitions" | "stackName"
    > = {},
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
    return new SimCfnParameters({
      definitions,
      values: Object.fromEntries(this.values),
      stackName: this.stackName,
    });
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
   * Resolve the runtime value for a declared or referenced Parameter.
   *
   * The returned value may have come from command input or from a string
   * Default in the template definition. Missing values are treated as
   * template/runtime errors because a Ref to a Parameter must resolve to a
   * concrete value.
   */
  value(parameterName: string): SimCloudFormationParameterValue {
    const value = this.values.get(parameterName);
    assertDefined(
      value,
      `Sim CloudFormation Stack ${this.stackNameLabel()} parameter ${parameterName} is missing a value`,
    );

    return value;
  }

  private recordDefinitions(
    definitions: Record<string, SimCfnParameterDefinition> | undefined,
  ): void {
    if (definitions === undefined) {
      return;
    }

    for (const [parameterName, parameterDefinition] of Object.entries(
      definitions,
    )) {
      if (!isRecord(parameterDefinition)) {
        throw new Error(
          `Sim CloudFormation Stack ${this.stackNameLabel()} parameter ${parameterName} definition must be an object`,
        );
      }

      this.definitions.set(parameterName, parameterDefinition);
    }
  }

  private recordValues(values: SimCloudFormationParameterValues): void {
    for (const [parameterName, parameterValue] of Object.entries(values)) {
      this.values.set(parameterName, parameterValue);
    }
  }

  private recordDefaultValues(): void {
    for (const [parameterName, parameterDefinition] of this.definitions) {
      if (this.values.has(parameterName)) {
        continue;
      }

      const defaultValue = parameterDefinition.Default;

      if (typeof defaultValue === "string") {
        this.values.set(parameterName, defaultValue);
      }
    }
  }

  private stackNameLabel(): string {
    return this.stackName ?? "unknown";
  }
}
