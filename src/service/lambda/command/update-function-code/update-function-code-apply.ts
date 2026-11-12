import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimLambdaExecutableCode } from "../../function/code/sim-lambda-executable-code.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionVersionStore } from "../../function/version/sim-lambda-function-version-store.js";
import type { UpdateFunctionCodeInput } from "./update-function-code-input.js";

interface SimLambdaCodeUpdate {
  readonly simFunction: SimLambdaFunction;
  readonly code: SimLambdaExecutableCode;
  readonly input: UpdateFunctionCodeInput;
  readonly background: BackgroundScheduler;
  readonly versions: SimLambdaFunctionVersionStore;
}

/**
 * Apply resolved code to a function, and answer with what the caller is told
 * about, which is a version of the updated code where `Publish` asked for one.
 *
 * A dry run has already checked everything a real update would, and changes
 * nothing.
 */
export function simLambdaAppliedCodeUpdate(
  update: SimLambdaCodeUpdate,
): SimLambdaFunction {
  const { simFunction, code, input, background, versions } = update;

  if (input.dryRun) {
    return simFunction;
  }

  simFunction.updates.begin(simFunction.arn, background, input.revisionId);
  simFunction.updateCode(code);

  return input.publish ? versions.publish(simFunction) : simFunction;
}
