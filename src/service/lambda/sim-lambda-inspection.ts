import type { SimLambdaEventSourceMapping } from "./event-source/sim-lambda-event-source-mapping.js";
import type { SimLambdaEventInvokeConfig } from "./function/event-invoke/sim-lambda-event-invoke-config.js";
import type {
  SimLambdaFunction,
  SimLambdaFunctionMap,
  SimLambdaFunctionName,
} from "./function/sim-lambda-function.js";
import type {
  SimLambdaFunctionUrl,
  SimLambdaFunctionUrlId,
} from "./function/url/sim-lambda-function-url.js";
import type { SimLambdaFunctionAlias } from "./function/version/sim-lambda-function-alias.js";
import type { SimLambdaFunctionTarget } from "./function/version/sim-lambda-function-target.js";
import type { SimLambdaCommands } from "./sim-lambda-commands.js";

/**
 * What a test or another simulated service can ask a simulated Lambda about
 * its own state.
 *
 * These are the simulator's own accessors rather than simulated API
 * operations: they go through no Command and no authorization. They are held
 * apart from the facade because the facade's job is delegating SDK commands,
 * and this is a different job that happens to live on the same object.
 */
export abstract class SimLambdaInspection {
  protected abstract readonly functions: SimLambdaFunctionMap;
  protected abstract readonly commands: SimLambdaCommands;

  /** Get a simulated event source mapping by its UUID. */
  getSimEventSourceMapping(
    uuid: string,
  ): SimLambdaEventSourceMapping | undefined {
    return this.commands.eventSourceMappings.find(uuid);
  }

  /**
   * Get the event invoke config one function name and qualifier hold, if they
   * hold one.
   *
   * A config written without a qualifier belongs to `$LATEST`, which is how a
   * function's own config is addressed.
   */
  getSimEventInvokeConfig(
    functionName: SimLambdaFunctionName | string,
    qualifier?: string,
  ): SimLambdaEventInvokeConfig | undefined {
    return this.commands.eventInvokeConfigStore.get({
      functionName,
      qualifier,
    });
  }

  /** Get a simulated Lambda function instance by name. */
  getSimFunctionByName(
    functionName: SimLambdaFunctionName | string,
  ): SimLambdaFunction | undefined {
    return this.functions.get(functionName as SimLambdaFunctionName);
  }

  /**
   * Get what a function name and a version or alias qualifier together name.
   *
   * This is how another simulated service reaches the function a target ARN
   * points at. The resource it answers with is what a delivery is authorized
   * against, and the function is the version that runs.
   */
  getSimFunctionTarget(
    functionName: SimLambdaFunctionName | string,
    qualifier?: string,
  ): SimLambdaFunctionTarget | undefined {
    return this.commands.functionLookup.findTarget(functionName, qualifier);
  }

  /** Get one alias of a simulated Lambda function, if it has one by name. */
  getSimFunctionAlias(
    functionName: SimLambdaFunctionName | string,
    aliasName: string,
  ): SimLambdaFunctionAlias | undefined {
    const simFunction = this.getSimFunctionByName(functionName);

    return simFunction === undefined
      ? undefined
      : this.commands.versionStore.of(simFunction).alias(aliasName);
  }

  /** Get a simulated Lambda function's Function URL, if it has one. */
  getSimFunctionUrl(
    functionName: SimLambdaFunctionName | string,
  ): SimLambdaFunctionUrl | undefined {
    return this.commands.functionUrlStore.get(functionName);
  }

  /**
   * Get a simulated Lambda Function URL by the id in its hostname.
   *
   * This is how the localhost serving layer finds the Function URL a request
   * was addressed to, once the registry has named the owning Account.
   */
  getSimFunctionUrlById(
    urlId: SimLambdaFunctionUrlId,
  ): SimLambdaFunctionUrl | undefined {
    return this.commands.functionUrlStore.byUrlId(urlId);
  }
}
