import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import {
  type SimLambdaDestinationTargets,
  SimLambdaNoDestinationTargets,
} from "../../destination/sim-lambda-destination-targets.js";
import type { SimLambdaEventInvokeConfigStore } from "../../function/event-invoke/sim-lambda-event-invoke-config-store.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import { SimLambdaAsyncInvocations } from "./async/sim-lambda-async-invocations.js";
import {
  parseInvokeEvent,
  simLambdaAsyncPayloadLimit,
} from "./invoke-payload.js";
import { simLambdaRequestResponse } from "./invoke-request-response.js";
import type {
  SimInvokeCommand,
  SimInvokeCommandOutput,
} from "./invoke.command.js";

interface SimLambdaInvocationDispatcherProperties {
  background?: BackgroundScheduler;
  eventInvokeConfigs?: SimLambdaEventInvokeConfigStore | undefined;
  destinations?: SimLambdaDestinationTargets | undefined;
}

/**
 * Dispatches an authorized Invoke request to a sim Lambda function using the
 * requested AWS invocation type.
 *
 * The function it is given is the one the request resolved to, so a request
 * for a published version reports that version as the one it ran.
 */
export class SimLambdaInvocationDispatcher {
  private readonly asyncInvocations: SimLambdaAsyncInvocations;

  constructor(properties: SimLambdaInvocationDispatcherProperties = {}) {
    this.asyncInvocations = new SimLambdaAsyncInvocations({
      background: properties.background ?? new BackgroundTasks(),
      destinations:
        properties.destinations ?? new SimLambdaNoDestinationTargets(),
      eventInvokeConfigs: properties.eventInvokeConfigs,
    });
  }

  /**
   * Dispatch the invocation and build the AWS-like Invoke output.
   *
   * An Event invocation is answered as soon as it is accepted, and how it goes
   * from there reaches its destinations rather than its caller, as on real
   * Lambda.
   */
  async dispatch(
    simFunction: SimLambdaFunction,
    command: SimInvokeCommand,
    qualifier: string | undefined,
    invokedFunctionArn: string,
  ): Promise<SimInvokeCommandOutput> {
    const invocationType = command.input.InvocationType ?? "RequestResponse";

    switch (invocationType) {
      case "RequestResponse": {
        return await simLambdaRequestResponse(
          simFunction,
          command,
          invokedFunctionArn,
        );
      }
      case "Event": {
        this.asyncInvocations.start(
          simFunction,
          parseInvokeEvent(command.input.Payload, simLambdaAsyncPayloadLimit),
          qualifier,
          invokedFunctionArn,
        );
        return { $metadata: {}, StatusCode: 202 };
      }
      case "DryRun": {
        return { $metadata: {}, StatusCode: 204 };
      }
    }
  }
}
