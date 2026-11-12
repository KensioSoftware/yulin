import type { SimLambdaFunctionConfiguration } from "./sim-lambda-function-configuration.js";
import type { SimLambdaFunction } from "./sim-lambda-function.js";

/**
 * The AWS-like configuration a function reports.
 *
 * Built here rather than on the function, which is at the length this codebase
 * allows, and which holds behaviour worth more of that length than a mapping
 * from its own public members to the shape AWS answers with.
 */
export function simLambdaFunctionConfigurationOf(
  simFunction: SimLambdaFunction,
): SimLambdaFunctionConfiguration {
  const { deadLetterTargetArn } = simFunction;

  return {
    FunctionName: simFunction.name,
    FunctionArn: simFunction.arn,
    Role: simFunction.roleArn,
    State: simFunction.state,
    LastUpdateStatus: simFunction.updates.status,
    RevisionId: simFunction.updates.revisionId,
    Version: simFunction.version,
    Timeout: simFunction.timeoutSeconds,
    MemorySize: simFunction.memorySizeMb,
    CodeSha256: simFunction.codePackage.sha256,
    CodeSize: simFunction.codePackage.size,
    Handler: simFunction.handlerName,
    Runtime: simFunction.runtimeName,
    Description: simFunction.description,
    Environment: simFunction.environment.configuration(),
    DeadLetterConfig:
      deadLetterTargetArn === undefined
        ? undefined
        : { TargetArn: deadLetterTargetArn },
  };
}
