import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimLambdaEventInvokeConfig } from "../../function/event-invoke/sim-lambda-event-invoke-config.js";
import type { SimLambda } from "../../sim-lambda.js";
import { simCfnLambdaCreatedResource } from "../sim-cfn-lambda-created-resource.js";

/**
 * Take an AWS::Lambda::EventInvokeConfig off the function it was written on,
 * so what is left of the function retries the default number of times and
 * sends its results nowhere.
 *
 * A config that has already gone is nothing to delete. Deleting a function
 * takes its configs with it, so a teardown that reached the function first
 * would otherwise fail here over work it had already done.
 */
export async function simCfnLambdaRemoveEventInvokeConfig(
  lambda: SimLambda,
  resource: SimCfnResource,
): Promise<void> {
  const { functionName, qualifier } =
    simCfnLambdaCreatedResource<SimLambdaEventInvokeConfig>(
      resource,
      "event invoke config",
    );

  if (lambda.getSimEventInvokeConfig(functionName, qualifier) === undefined) {
    return;
  }

  await lambda.deleteFunctionEventInvokeConfig({
    input: { FunctionName: functionName, Qualifier: qualifier },
  });
}
