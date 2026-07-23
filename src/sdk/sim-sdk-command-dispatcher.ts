import { SimAwsCallerResolver } from "../service/aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsPrincipal } from "../service/aws/caller/sim-aws-caller.js";
import { simAwsRunAsContext } from "../service/aws/caller/sim-aws-run-as-context.js";
import type { SimAws } from "../service/aws/sim-aws.js";
import {
  simSdkClientRegionName,
  simSdkClientServiceId,
} from "./client/sim-sdk-client.js";
import {
  SimSdkCommandNotInterceptedError,
  SimSdkUnsupportedCommandError,
} from "./error/sim-sdk.error.js";
import { resolveSimSdkCommandRouter } from "./router/resolve-sim-sdk-command-router.js";

/**
 * Dispatches intercepted SDK Commands to simulated AWS service operations.
 *
 * The Account/Region scope and caller are resolved per dispatched Command,
 * never per client, so ambient callers such as SimAws.runAs, and later
 * simulated Lambda execution roles, take effect at send time.
 */
export class SimSdkCommandDispatcher {
  private readonly simAws: SimAws;

  constructor(simAws: SimAws) {
    this.simAws = simAws;
  }

  /**
   * Route one intercepted SDK Command to a simulated service operation.
   */
  async dispatch(
    command: object,
    client: unknown,
    commandNames: ReadonlySet<string> | undefined,
  ): Promise<unknown> {
    const commandName = command.constructor.name;
    if (commandNames !== undefined && !commandNames.has(commandName)) {
      throw new SimSdkCommandNotInterceptedError(
        `SDK Command ${commandName} is not in this interception's Command ` +
          `allow list`,
      );
    }

    const serviceId = simSdkClientServiceId(client);
    const caller = this.ambientCaller();
    const accountId = callerAccountId(caller) ?? this.simAws.defaultAccountId;
    const regionName = await simSdkClientRegionName(
      client,
      this.simAws.defaultRegionName,
    );

    const router = resolveSimSdkCommandRouter(
      this.simAws,
      serviceId,
      accountId,
      regionName,
    );
    const route = router.route(commandName);
    if (route === undefined) {
      throw new SimSdkUnsupportedCommandError(
        `Simulated ${serviceId} does not support SDK Command ` +
          `${commandName}. Supported Commands: ${router
            .supportedCommandNames()
            .join(", ")}`,
      );
    }

    return await route(command, { caller });
  }

  /**
   * Get the ambient SimAws.runAs caller for this dispatcher's SimAws
   * instance, if one is set.
   *
   * Only this SimAws instance's own run-as caller applies: a run-as on a
   * different SimAws instance is a different simulated universe and never
   * affects Commands dispatched here.
   */
  private ambientCaller(): SimAwsPrincipal | undefined {
    return simAwsRunAsContext.currentCaller(this.simAws);
  }
}

/**
 * Resolve the AWS Account a caller belongs to, when it identifies one.
 */
function callerAccountId(
  caller: SimAwsPrincipal | undefined,
): string | undefined {
  if (caller === undefined) {
    return undefined;
  }
  return new SimAwsCallerResolver().resolve(caller, caller).accountId;
}
