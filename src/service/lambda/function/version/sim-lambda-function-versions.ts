import {
  type SimLambdaFunctionArn,
  simLambdaFunctionArn,
} from "../sim-lambda-function-configuration.js";
import type { SimLambdaFunction } from "../sim-lambda-function.js";
import type { SimLambdaFunctionAlias } from "./sim-lambda-function-alias.js";
import type { SimLambdaFunctionTarget } from "./sim-lambda-function-target.js";

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
   * The code and settings the latest version was published with.
   */
  private publishedContent: string | undefined;

  /**
   * Publish the function as it stands as the next version.
   *
   * A function whose code and settings are what they were when the latest
   * version was published gets that version back. Real Lambda answers the
   * same way, and compares the content: a setting changed and changed back
   * leaves nothing to publish. Tags and permissions are outside it.
   */
  publish(
    simFunction: SimLambdaFunction,
    description?: string,
  ): SimLambdaFunction {
    const content = publishableContent(simFunction);
    const latest = this.published.at(-1);

    if (latest !== undefined && content === this.publishedContent) {
      return latest;
    }

    const version = simFunction.publishedAs(
      String(this.nextVersionNumber),
      description,
    );

    this.nextVersionNumber += 1;
    this.published.push(version);
    this.publishedContent = content;

    return version;
  }

  /**
   * Every published version, oldest first.
   */
  all(): readonly SimLambdaFunction[] {
    return this.published;
  }

  /**
   * What a qualifier names, or nothing when it names neither a version nor an
   * alias.
   *
   * Real Lambda tells the two apart the way this does. An alias name cannot be
   * all digits, so a qualifier that is one is a version number.
   *
   * An alias is the resource a grant is made on and a request is authorized
   * against, so it answers as the resource while the version it points at is
   * what runs.
   */
  target(qualifier: string): SimLambdaFunctionTarget | undefined {
    if (isVersionNumber(qualifier)) {
      const version = this.version(qualifier);

      return version === undefined
        ? undefined
        : { resource: version, simFunction: version };
    }

    const alias = this.aliases.get(qualifier);
    const version =
      alias === undefined ? undefined : this.version(alias.functionVersion);

    return alias === undefined || version === undefined
      ? undefined
      : { resource: alias, simFunction: version };
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
 * The code and settings a version would be published with, in a form two
 * publishes can compare.
 */
function publishableContent(simFunction: SimLambdaFunction): string {
  const configuration = simFunction.configuration();

  return JSON.stringify([
    configuration.CodeSha256,
    configuration.Role,
    configuration.Handler,
    configuration.Runtime,
    configuration.Timeout,
    configuration.MemorySize,
    configuration.Description,
    configuration.Environment,
    configuration.DeadLetterConfig,
  ]);
}

/**
 * Whether a qualifier is a version number rather than an alias name, which is
 * how real Lambda tells the two apart.
 */
function isVersionNumber(qualifier: string): boolean {
  return /^\d+$/.test(qualifier);
}
