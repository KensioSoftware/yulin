import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimGetAccountCommand,
  SimPutAccountDetailsCommand,
} from "../command/account/account.command.js";
import type {
  SimCreateEmailIdentityCommand,
  SimDeleteEmailIdentityCommand,
  SimGetEmailIdentityCommand,
  SimListEmailIdentitiesCommand,
} from "../command/identity/identity.command.js";
import type { SimSendEmailCommand } from "../command/send/send.command.js";
import type { SimSesV2 } from "../sim-ses-v2.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated SES.
 */
export class SimSesSdkCommandRouter implements SimSdkCommandRouter {
  readonly #routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simSes: SimSesV2) {
    this.#routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateEmailIdentityCommand",
        async (command, context): Promise<unknown> =>
          await simSes.createEmailIdentity(
            command as SimCreateEmailIdentityCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetEmailIdentityCommand",
        async (command, context): Promise<unknown> =>
          await simSes.getEmailIdentity(
            command as SimGetEmailIdentityCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListEmailIdentitiesCommand",
        async (command, context): Promise<unknown> =>
          await simSes.listEmailIdentities(
            command as SimListEmailIdentitiesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteEmailIdentityCommand",
        async (command, context): Promise<unknown> =>
          await simSes.deleteEmailIdentity(
            command as SimDeleteEmailIdentityCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "SendEmailCommand",
        async (command, context): Promise<unknown> =>
          await simSes.sendEmail(
            command as SimSendEmailCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetAccountCommand",
        async (command, context): Promise<unknown> =>
          await simSes.getAccount(
            command as SimGetAccountCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutAccountDetailsCommand",
        async (command, context): Promise<unknown> =>
          await simSes.putAccountDetails(
            command as SimPutAccountDetailsCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated SES can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.#routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated SES supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.#routes.get(commandName);
  }
}
