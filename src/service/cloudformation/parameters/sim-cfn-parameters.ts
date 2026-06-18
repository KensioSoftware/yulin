type SimCloudFormationParameterValue = string;

type SimCloudFormationParameterValues = Record<
  string,
  SimCloudFormationParameterValue
>;

export interface SimCloudFormationParameterInput {
  readonly Parameters?:
    | readonly {
        readonly ParameterKey?: string | undefined;
        readonly ParameterValue?: string | undefined;
      }[]
    | undefined;
}

interface SimCfnParametersProps {
  readonly definitions?: Record<string, unknown> | undefined;
  readonly values?: SimCloudFormationParameterValues | undefined;
  readonly stackName?: string | undefined;
}

/**
 * Convenience wrapper for a CloudFormation template Parameters section.
 */
export class SimCfnParameters {
  private readonly definitions = new Map<string, Record<string, unknown>>();
  private readonly values = new Map<string, SimCloudFormationParameterValue>();
  private readonly stackName: string | undefined;

  constructor(props: SimCfnParametersProps = {}) {
    const { definitions, values = {}, stackName } = props;

    this.stackName = stackName;

    this.recordDefinitions(definitions);
    this.recordValues(values);
    this.recordDefaultValues();
  }

  /**
   * Create Parameters from CloudFormation command-style Parameter inputs.
   */
  static fromInput(
    input: SimCloudFormationParameterInput,
    props: Pick<SimCfnParametersProps, "definitions" | "stackName"> = {},
  ): SimCfnParameters {
    const values: SimCloudFormationParameterValues = {};

    for (const parameter of input.Parameters ?? []) {
      if (
        parameter.ParameterKey === undefined ||
        parameter.ParameterValue === undefined
      ) {
        continue;
      }

      values[parameter.ParameterKey] = parameter.ParameterValue;
    }

    return new SimCfnParameters({
      ...props,
      values,
    });
  }

  /**
   * Create Parameters from already-normalized Parameter values.
   */
  static fromValues(
    values: SimCloudFormationParameterValues,
    props: Pick<SimCfnParametersProps, "definitions" | "stackName"> = {},
  ): SimCfnParameters {
    return new SimCfnParameters({
      ...props,
      values,
    });
  }

  /**
   * Return a copy of this Parameters wrapper with template definitions attached.
   */
  withDefinitions(
    definitions: Record<string, unknown> | undefined,
  ): SimCfnParameters {
    return new SimCfnParameters({
      definitions,
      values: Object.fromEntries(this.values),
      stackName: this.stackName,
    });
  }

  /**
   * Whether the template defines a Parameter with this name.
   */
  has(parameterName: string): boolean {
    return this.definitions.has(parameterName);
  }

  /**
   * Resolve a template Parameter value.
   */
  value(parameterName: string): SimCloudFormationParameterValue {
    const value = this.values.get(parameterName);

    if (value === undefined) {
      throw new Error(
        `Sim CloudFormation Stack ${this.stackNameLabel()} parameter ${parameterName} is missing a value`,
      );
    }

    return value;
  }

  private recordDefinitions(
    definitions: Record<string, unknown> | undefined,
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

      const defaultValue = parameterDefinition["Default"];

      if (typeof defaultValue === "string") {
        this.values.set(parameterName, defaultValue);
      }
    }
  }

  private stackNameLabel(): string {
    return this.stackName ?? "unknown";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
