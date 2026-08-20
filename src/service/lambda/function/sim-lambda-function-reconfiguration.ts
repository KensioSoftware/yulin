import type { SimLambdaExecutableCode } from "./code/sim-lambda-executable-code.js";
import { SimLambdaEnvironment } from "./environment/sim-lambda-environment.js";
import type { SimLambdaFunction } from "./sim-lambda-function.js";

/**
 * A change to the settings of a sim Lambda function, in the function model's
 * own terms.
 *
 * A setting left out is a setting the request said nothing about, and keeps
 * the value it has.
 */
export interface SimLambdaFunctionConfigurationUpdate {
  readonly roleArn?: string | undefined;
  readonly handlerName?: string | undefined;
  readonly runtimeName?: string | undefined;
  readonly description?: string | undefined;
  readonly timeoutSeconds?: number | undefined;
  readonly memorySizeMb?: number | undefined;
  /**
   * The variables to declare, replacing whatever the function declares now.
   *
   * An empty map is a request to declare none, which is different from
   * leaving this out, and real Lambda tells the two apart the same way.
   */
  readonly environmentVariables?: ReadonlyMap<string, string> | undefined;
  /**
   * The queue or topic to dead-letter to, or an empty string to stop
   * dead-lettering, which is how AWS takes a target away.
   */
  readonly deadLetterTargetArn?: string | undefined;
}

/**
 * Apply a settings change to a sim Lambda function, and say what code it runs
 * afterwards.
 *
 * The answer is the code the function already had, unless the change reached
 * inside it. Sandboxed zip code holds the environment it reads variables from
 * and the handler name that finds its export, so a change to either gives the
 * function code of its own to cold start.
 */
export function reconfigureSimLambdaFunction(
  simFunction: SimLambdaFunction,
  update: SimLambdaFunctionConfigurationUpdate,
  code: SimLambdaExecutableCode,
): SimLambdaExecutableCode {
  const previous = {
    environment: simFunction.environment,
    handlerName: simFunction.handlerName,
  };

  simFunction.roleArn = update.roleArn ?? simFunction.roleArn;
  simFunction.handlerName = update.handlerName ?? simFunction.handlerName;
  simFunction.runtimeName = update.runtimeName ?? simFunction.runtimeName;
  simFunction.description = update.description ?? simFunction.description;
  simFunction.timeoutSeconds =
    update.timeoutSeconds ?? simFunction.timeoutSeconds;
  simFunction.memorySizeMb = update.memorySizeMb ?? simFunction.memorySizeMb;
  simFunction.environment = updatedEnvironment(simFunction, update);
  simFunction.deadLetterTargetArn = updatedDeadLetterTarget(
    simFunction,
    update,
  );

  if (
    simFunction.environment === previous.environment &&
    simFunction.handlerName === previous.handlerName
  ) {
    return code;
  }

  return code.reconfigured({
    environment: simFunction.environment,
    handlerName: simFunction.handlerName,
  });
}

/**
 * The environment a function runs with after a settings change.
 *
 * Rebuilt when the declared variables change, and when the memory size does,
 * because the runtime reports that as a variable of its own. A rebuilt
 * environment is a cold one, so a variable a handler wrote into `process.env`
 * goes with the old one, as it goes on real Lambda when the configuration
 * changes.
 */
function updatedEnvironment(
  simFunction: SimLambdaFunction,
  update: SimLambdaFunctionConfigurationUpdate,
): SimLambdaEnvironment {
  const { environmentVariables } = update;

  if (environmentVariables === undefined && update.memorySizeMb === undefined) {
    return simFunction.environment;
  }

  return new SimLambdaEnvironment({
    functionName: simFunction.name,
    regionName: simFunction.accountRegionScope.regionName,
    memorySizeMb: simFunction.memorySizeMb,
    declaredVariables:
      environmentVariables ?? simFunction.environment.declaredVariables,
  });
}

/**
 * The dead-letter target a function has after a settings change.
 */
function updatedDeadLetterTarget(
  simFunction: SimLambdaFunction,
  update: SimLambdaFunctionConfigurationUpdate,
): string | undefined {
  if (update.deadLetterTargetArn === undefined) {
    return simFunction.deadLetterTargetArn;
  }

  return update.deadLetterTargetArn === ""
    ? undefined
    : update.deadLetterTargetArn;
}
