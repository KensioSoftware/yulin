import type { SimLambdaFunctionArn } from "../sim-lambda-function-configuration.js";

/**
 * Minimal structural Lambda alias configuration, as returned by CreateAlias,
 * UpdateAlias, GetAlias and ListAliases.
 */
export interface SimLambdaFunctionAliasConfiguration {
  AliasArn: SimLambdaFunctionArn;
  Name: string;
  FunctionVersion: string;
  Description?: string | undefined;
}

interface SimLambdaFunctionAliasProperties {
  readonly aliasArn: SimLambdaFunctionArn;
  readonly name: string;
  readonly functionVersion: string;
  readonly description?: string | undefined;
}

/**
 * Simulated Lambda alias resource. An alias is a name for one published
 * version.
 *
 * An alias is what a deployed application invokes, so the version it points at
 * changes while the name integrations were built against stays where it is.
 */
export class SimLambdaFunctionAlias {
  public readonly aliasArn: SimLambdaFunctionArn;
  public readonly name: string;

  #functionVersion: string;
  #description: string | undefined;

  constructor(properties: SimLambdaFunctionAliasProperties) {
    this.aliasArn = properties.aliasArn;
    this.name = properties.name;
    this.#functionVersion = properties.functionVersion;
    this.#description = properties.description;
  }

  /**
   * The published version this alias points at.
   */
  get functionVersion(): string {
    return this.#functionVersion;
  }

  /**
   * Point this alias at another version, and describe it again.
   *
   * Omitted values are left as they are, as real UpdateAlias leaves them.
   */
  update(properties: {
    readonly functionVersion?: string | undefined;
    readonly description?: string | undefined;
  }): void {
    this.#functionVersion = properties.functionVersion ?? this.#functionVersion;
    this.#description = properties.description ?? this.#description;
  }

  /**
   * Get the AWS-like configuration for this alias.
   */
  configuration(): SimLambdaFunctionAliasConfiguration {
    return {
      AliasArn: this.aliasArn,
      Name: this.name,
      FunctionVersion: this.#functionVersion,
      Description: this.#description,
    };
  }
}
