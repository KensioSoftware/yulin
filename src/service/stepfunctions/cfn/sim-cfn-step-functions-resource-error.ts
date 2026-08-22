import {
  SimStatesUnsimulatedInput,
  SimStepFunctionsError,
} from "../error/sim-step-functions.error.js";

/**
 * Build the error a Resource of a simulated Step Functions type is refused
 * with.
 *
 * Sim CloudFormation fails a Stack on this one, so it is kept for a Resource
 * nothing coherent could be deployed from. A template carrying no definition
 * at all, a definition Amazon States Language itself refuses, a name Step
 * Functions will not take. Real CloudFormation fails those too. A definition
 * this simulator cannot run is a different thing and takes the skip below.
 */
export function simCfnStepFunctionsResourceError(
  resourceType: string,
  logicalId: string,
  reason: string,
  cause?: unknown,
): Error {
  return new Error(`Invalid ${resourceType} Resource ${logicalId}: ${reason}`, {
    cause,
  });
}

/**
 * Build the error a Resource carrying something the interpreter cannot run is
 * skipped with.
 *
 * The "Unsupported sim ... CloudFormation" wording is what sim CloudFormation
 * reads as a Resource to record and step over, so the Resource lands on
 * `stack.skippedResources` carrying the reason Step Functions gave, and the
 * rest of the template deploys.
 *
 * A state machine missing one state runs wrong, and a test watching it run
 * wrong is worse off than one watching it be absent. So the whole state
 * machine goes rather than the state, and the Stack around it is no business
 * of one workflow.
 */
export function simCfnStepFunctionsSkippedResourceError(
  resourceType: string,
  logicalId: string,
  reason: string,
  cause?: unknown,
): Error {
  return new Error(
    `Unsupported sim StepFunctions CloudFormation ${resourceType} Resource ` +
      `${logicalId}: ${reason}`,
    { cause },
  );
}

/**
 * Run the simulated Step Functions commands one Resource is made of, naming
 * the Resource in whatever they refuse.
 *
 * Every Resource type here goes through the ordinary Step Functions commands,
 * so what a template may ask for is decided once, by simulated Step Functions,
 * rather than again in the CloudFormation layer. What that leaves out is where
 * the request came from. A deployment failing with `The state Fan is a Parallel
 * state` says which state but not which Resource declared it, and a template
 * can hold several.
 *
 * The two kinds of refusal part company here. A definition Amazon States
 * Language refuses is a failed Resource, and one it accepts that this
 * simulator cannot run is a skipped one.
 */
export async function simCfnStepFunctionsResourceCommand<T>(
  resourceType: string,
  logicalId: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SimStatesUnsimulatedInput) {
      throw simCfnStepFunctionsSkippedResourceError(
        resourceType,
        logicalId,
        error.message,
        error,
      );
    }

    if (error instanceof SimStepFunctionsError) {
      throw simCfnStepFunctionsResourceError(
        resourceType,
        logicalId,
        error.message,
        error,
      );
    }

    throw error;
  }
}
