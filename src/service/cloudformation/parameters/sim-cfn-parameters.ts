export type SimCloudFormationParameterValue = string;

export type SimCloudFormationParameterValues = Record<
  string,
  SimCloudFormationParameterValue
>;

interface SimCfnParametersProps {
  readonly definitions?: Record<string, unknown> | undefined;
  readonly overrides?: SimCloudFormationParameterValues | undefined;
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
    const { definitions, overrides = {}, stackName } = props;

    this.stackName = stackName;

    this.recordDefinitions(definitions);
    this.recordOverrides(overrides);
    this.recordDefaultValues();
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

  private recordOverrides(overrides: SimCloudFormationParameterValues): void {
    for (const [parameterName, parameterValue] of Object.entries(overrides)) {
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
