import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import type { SimLambdaPolicyResource } from "../policy/sim-lambda-policy-resource.js";
import { SIM_LAMBDA_LATEST_VERSION } from "../sim-lambda-function-configuration.js";
import type {
  SimLambdaFunction,
  SimLambdaFunctionName,
} from "../sim-lambda-function.js";
import type { SimLambdaFunctionTarget } from "./sim-lambda-function-target.js";
import {
  simLambdaQualifiedFunctionArn,
  SimLambdaFunctionVersions,
} from "./sim-lambda-function-versions.js";

/**
 * Published version state for one Account/Region scope of simulated Lambda.
 *
 * Versions belong to the function they were published from, so they are held
 * by function name and go when the function does, the way a Function URL
 * does. Holding them beside the function map rather than on the function
 * itself is what keeps a bare name resolving to `$LATEST` for every caller
 * that asks for no qualifier.
 */
export class SimLambdaFunctionVersionStore {
  private readonly versions = new Map<
    SimLambdaFunctionName,
    SimLambdaFunctionVersions
  >();

  /**
   * Publish a function as it stands as its next version.
   */
  publish(simFunction: SimLambdaFunction): SimLambdaFunction {
    return this.of(simFunction).publish(simFunction);
  }

  /**
   * Every version of a function, `$LATEST` first, as ListVersionsByFunction
   * reports them.
   */
  all(simFunction: SimLambdaFunction): readonly SimLambdaFunction[] {
    return [simFunction, ...this.of(simFunction).all()];
  }

  /**
   * The version of a function a qualifier names, or fail as AWS does when the
   * qualifier names neither a version nor an alias.
   *
   * A caller asking for no qualifier, or for `$LATEST`, gets the function
   * itself. An alias resolves to the version it points at.
   */
  require(
    simFunction: SimLambdaFunction,
    qualifier: string | undefined,
  ): SimLambdaFunction {
    return this.requireTarget(simFunction, qualifier).simFunction;
  }

  /**
   * What a qualifier names, or nothing when there is no such function or the
   * qualifier names neither a version nor an alias.
   *
   * A function that is not there answers with nothing, since a request naming
   * one is authorized before it is reported missing, and since a service whose
   * target was configured before the function was created has to be able to
   * ask.
   */
  findTarget(
    simFunction: SimLambdaFunction | undefined,
    qualifier: string | undefined,
  ): SimLambdaFunctionTarget | undefined {
    if (simFunction === undefined) {
      return undefined;
    }

    return qualifier === undefined || qualifier === SIM_LAMBDA_LATEST_VERSION
      ? { resource: simFunction, simFunction }
      : this.of(simFunction).target(qualifier);
  }

  /**
   * What a qualifier names, or fail as AWS does when it names neither a
   * version nor an alias.
   */
  requireTarget(
    simFunction: SimLambdaFunction,
    qualifier: string | undefined,
  ): SimLambdaFunctionTarget {
    const target = this.findTarget(simFunction, qualifier);

    if (target === undefined) {
      // Only a qualifier naming neither a version nor an alias reaches here,
      // since a caller passing none gets the function itself.
      throw new SimLambdaResourceNotFoundException(
        `Function not found: ${simLambdaQualifiedFunctionArn(
          simFunction,
          qualifier ?? SIM_LAMBDA_LATEST_VERSION,
        )}`,
      );
    }

    return target;
  }

  /**
   * The resource a qualifier names, or nothing when there is no such function
   * or the qualifier names neither a version nor an alias.
   *
   * An alias answers as itself here rather than as the version it points at,
   * because the two hold their own resource policies. Resolving the alias
   * first would evaluate the version's policy for a request made against the
   * alias.
   */
  findResource(
    simFunction: SimLambdaFunction | undefined,
    qualifier: string | undefined,
  ): SimLambdaPolicyResource | undefined {
    return this.findTarget(simFunction, qualifier)?.resource;
  }

  /**
   * The resource a qualifier names, or fail as AWS does when it names neither
   * a version nor an alias.
   */
  requireResource(
    simFunction: SimLambdaFunction,
    qualifier: string | undefined,
  ): SimLambdaPolicyResource {
    return this.requireTarget(simFunction, qualifier).resource;
  }

  /**
   * Ensure a version of a function was published under a number, as an alias
   * only ever points at one that was.
   */
  requireVersion(simFunction: SimLambdaFunction, versionNumber: string): void {
    if (this.of(simFunction).version(versionNumber) === undefined) {
      throw new SimLambdaResourceNotFoundException(
        `Function not found: ${simLambdaQualifiedFunctionArn(simFunction, versionNumber)}`,
      );
    }
  }

  /**
   * Forget everything published from a function, as deleting a function takes
   * its versions and aliases with it.
   */
  forget(simFunction: SimLambdaFunction): void {
    this.versions.delete(simFunction.name);
  }

  /**
   * The versions and aliases of one function, which is where the alias store
   * keeps its own state as well.
   */
  of(simFunction: SimLambdaFunction): SimLambdaFunctionVersions {
    const versions =
      this.versions.get(simFunction.name) ?? new SimLambdaFunctionVersions();

    this.versions.set(simFunction.name, versions);

    return versions;
  }
}
