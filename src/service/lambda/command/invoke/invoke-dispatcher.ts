import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import {
  functionErrorPayload,
  parseInvokeEvent,
  resultPayload,
} from "./invoke-payload.js";
import type {
  SimInvokeCommand,
  SimInvokeCommandOutput,
} from "./invoke.command.js";

interface SimLambdaInvocationDispatcherProperties {
  background?: BackgroundScheduler;
}

/**
 * Dispatches an authorized Invoke request to a sim Lambda function using the
 * requested AWS invocation type.
 *
 * The function it is given is the one the request resolved to, so a request
 * for a published version reports that version as the one it ran.
 */
export class SimLambdaInvocationDispatcher {
  private readonly background: BackgroundScheduler;

  constructor(properties: SimLambdaInvocationDispatcherProperties = {}) {
    const { background = new BackgroundTasks() } = properties;
    this.background = background;
  }

  /**
   * Dispatch the invocation and build the AWS-like Invoke output.
   */
  async dispatch(
    simFunction: SimLambdaFunction,
    command: SimInvokeCommand,
  ): Promise<SimInvokeCommandOutput> {
    const invocationType = command.input.InvocationType ?? "RequestResponse";

    switch (invocationType) {
      case "RequestResponse": {
        return await this.requestResponse(simFunction, command);
      }
      case "Event": {
        this.scheduleEventInvocation(simFunction, command);
        return { $metadata: {}, StatusCode: 202 };
      }
      case "DryRun": {
        return { $metadata: {}, StatusCode: 204 };
      }
    }
  }

  private async requestResponse(
    simFunction: SimLambdaFunction,
    command: SimInvokeCommand,
  ): Promise<SimInvokeCommandOutput> {
    const event = parseInvokeEvent(command.input.Payload);

    try {
      const result = await simFunction.invoke(event);
      return {
        $metadata: {},
        StatusCode: 200,
        ExecutedVersion: simFunction.version,
        Payload: resultPayload(result),
      };
    } catch (error) {
      return {
        $metadata: {},
        StatusCode: 200,
        ExecutedVersion: simFunction.version,
        FunctionError: "Unhandled",
        Payload: functionErrorPayload(error),
      };
    }
  }

  private scheduleEventInvocation(
    simFunction: SimLambdaFunction,
    command: SimInvokeCommand,
  ): void {
    const event = parseInvokeEvent(command.input.Payload);

    this.background.schedule(async () => {
      try {
        await simFunction.invoke(event);
      } catch {
        // As on real Lambda, asynchronous invocation errors are not surfaced
        // to the caller. Failure destinations are not simulated yet.
      }
    });
  }
}
