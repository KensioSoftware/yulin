import {
  type SimLambdaFunctionArn,
  simLambdaFunctionArn,
} from "../sim-lambda-function-configuration.js";
import type { SimLambdaPolicyResource } from "../policy/sim-lambda-policy-resource.js";
import type { SimLambdaFunction } from "../sim-lambda-function.js";
import type { SimLambdaFunctionAlias } from "./sim-lambda-function-alias.js";

/**
 * The ARN a version or an alias of a function has, which is the function's own
 * ARN with the qualifier on the end.
 */
export function simLambdaQualifiedFunctionArn(
  simFunction: SimLambdaFunction,
  qualifier: string,
): SimLambdaFunctionArn {
  return simLambdaFunctionArn(
    simFunction.accountRegionScope,
    simFunction.name,
    qualifier,
  );
}

/**
 * The published versions and aliases of one simulated Lambda function.
 *
 * Version numbers count up from 1 and are never reused, so the next one comes
 * from a counter rather than from how many versions are held.
 */
export class SimLambdaFunctionVersions {
  private readonly published: SimLambdaFunction[] = [];
  private readonly aliases = new Map<string, SimLambdaFunctionAlias>();

  private nextVersionNumber = 1;

  /**
   * Publish the function as it stands as the next version.
   */
  publish(simFunction: SimLambdaFunction): SimLambdaFunction {
    const version = simFunction.publishedAs(String(this.nextVersionNumber));

    this.nextVersionNumber += 1;
    this.published.push(version);

    return version;
  }

  /**
   * Every published version, oldest first.
   */
  all(): readonly SimLambdaFunction[] {
    return this.published;
  }

  /**
   * The version a qualifier names, or nothing when it names neither a version
   * nor an alias.
   *
   * Real Lambda tells the two apart the way this does. An alias name cannot be
   * all digits, so a qualifier that is one is a version number.
   */
  resolve(qualifier: string): SimLambdaFunction | undefined {
    if (isVersionNumber(qualifier)) {
      return this.version(qualifier);
    }

    const alias = this.aliases.get(qualifier);

    return alias === undefined
      ? undefined
      : this.version(alias.functionVersion);
  }

  /**
   * The resource a qualifier names, or nothing when it names neither a version
   * nor an alias.
   *
   * This stops where `resolve` carries on: an alias is the resource a grant is
   * made on and a request is authorized against, so it answers as itself
   * rather than as the version behind it.
   */
  named(qualifier: string): SimLambdaPolicyResource | undefined {
    return isVersionNumber(qualifier)
      ? this.version(qualifier)
      : this.aliases.get(qualifier);
  }

  /**
   * The version with a number, or nothing when none was published under it.
   */
  version(versionNumber: string): SimLambdaFunction | undefined {
    return this.published.find(
      (published) => published.version === versionNumber,
    );
  }

  /**
   * The alias with a name, or nothing when no alias has it.
   */
  alias(name: string): SimLambdaFunctionAlias | undefined {
    return this.aliases.get(name);
  }

  /**
   * Every alias, in the order they were created.
   */
  allAliases(): readonly SimLambdaFunctionAlias[] {
    return this.aliases.values().toArray();
  }

  /**
   * Hold an alias under its own name.
   */
  addAlias(alias: SimLambdaFunctionAlias): void {
    this.aliases.set(alias.name, alias);
  }

  /**
   * Drop an alias, leaving the version it pointed at where it is.
   */
  deleteAlias(name: string): void {
    this.aliases.delete(name);
  }
}

/**
 * Whether a qualifier is a version number rather than an alias name, which is
 * how real Lambda tells the two apart.
 */
function isVersionNumber(qualifier: string): boolean {
  return /^\d+$/.test(qualifier);
}
