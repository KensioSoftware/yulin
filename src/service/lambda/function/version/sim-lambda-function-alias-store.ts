import { SimLambdaResourceConflictException } from "../../error/sim-lambda.error.js";
import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import type { SimLambdaFunction } from "../sim-lambda-function.js";
import { SimLambdaFunctionAlias } from "./sim-lambda-function-alias.js";
import type { SimLambdaFunctionVersionStore } from "./sim-lambda-function-version-store.js";
import { simLambdaQualifiedFunctionArn } from "./sim-lambda-function-versions.js";

interface SimLambdaFunctionAliasStoreProperties {
  readonly versions: SimLambdaFunctionVersionStore;
}

interface SimLambdaCreateAliasProperties {
  readonly simFunction: SimLambdaFunction;
  readonly name: string;
  readonly functionVersion: string;
  readonly description?: string | undefined;
}

interface SimLambdaUpdateAliasProperties {
  readonly simFunction: SimLambdaFunction;
  readonly name: string;
  readonly functionVersion?: string | undefined;
  readonly description?: string | undefined;
}

/**
 * Alias state for one Account/Region scope of simulated Lambda.
 *
 * An alias belongs to the function it names a version of, and is held beside
 * that function's versions so that deleting the function drops both at once.
 */
export class SimLambdaFunctionAliasStore {
  private readonly versions: SimLambdaFunctionVersionStore;

  constructor(properties: SimLambdaFunctionAliasStoreProperties) {
    this.versions = properties.versions;
  }

  /**
   * Point a new alias at a published version of a function.
   */
  create(properties: SimLambdaCreateAliasProperties): SimLambdaFunctionAlias {
    const { simFunction, name, functionVersion, description } = properties;

    this.versions.requireVersion(simFunction, functionVersion);

    if (this.versions.of(simFunction).alias(name) !== undefined) {
      throw new SimLambdaResourceConflictException(
        `Alias already exists: ${simLambdaQualifiedFunctionArn(simFunction, name)}`,
      );
    }

    const alias = new SimLambdaFunctionAlias({
      arn: simLambdaQualifiedFunctionArn(simFunction, name),
      name,
      functionVersion,
      description,
    });
    this.versions.of(simFunction).addAlias(alias);

    return alias;
  }

  /**
   * Point an existing alias at another version, and describe it again.
   */
  update(properties: SimLambdaUpdateAliasProperties): SimLambdaFunctionAlias {
    const { simFunction, name, functionVersion, description } = properties;
    const alias = this.require(simFunction, name);

    if (functionVersion !== undefined) {
      this.versions.requireVersion(simFunction, functionVersion);
    }

    alias.update({ functionVersion, description });

    return alias;
  }

  /**
   * A function's alias by name, or fail as AWS does when it has no such alias.
   */
  require(
    simFunction: SimLambdaFunction,
    name: string,
  ): SimLambdaFunctionAlias {
    const alias = this.versions.of(simFunction).alias(name);

    if (alias === undefined) {
      throw new SimLambdaResourceNotFoundException(
        `Alias not found: ${simLambdaQualifiedFunctionArn(simFunction, name)}`,
      );
    }

    return alias;
  }

  /**
   * Every alias a function has, narrowed to one version when asked for.
   *
   * The version has to be one the function has. Narrowing to a version nothing
   * published is a request against something that is not there, and comes back
   * as that rather than as an empty listing.
   */
  all(
    simFunction: SimLambdaFunction,
    functionVersion?: string,
  ): readonly SimLambdaFunctionAlias[] {
    const aliases = this.versions.of(simFunction).allAliases();

    if (functionVersion === undefined) {
      return aliases;
    }

    this.versions.require(simFunction, functionVersion);

    return aliases.filter((alias) => alias.functionVersion === functionVersion);
  }

  /**
   * Drop an alias of a function, or fail as AWS does when it has no such
   * alias.
   */
  delete(simFunction: SimLambdaFunction, name: string): void {
    this.require(simFunction, name);
    this.versions.of(simFunction).deleteAlias(name);
  }
}
