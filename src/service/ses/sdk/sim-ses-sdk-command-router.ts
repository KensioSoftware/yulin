import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimGetAccountCommand,
  SimPutAccountDetailsCommand,
  SimPutAccountSuppressionAttributesCommand,
} from "../command/account/account.command.js";
import type {
  SimCreateEmailIdentityCommand,
  SimDeleteEmailIdentityCommand,
  SimGetEmailIdentityCommand,
  SimListEmailIdentitiesCommand,
} from "../command/identity/identity.command.js";
import type {
  SimCreateConfigurationSetCommand,
  SimDeleteConfigurationSetCommand,
  SimGetConfigurationSetCommand,
  SimListConfigurationSetsCommand,
} from "../command/configuration-set/configuration-set.command.js";
import type { SimSendEmailCommand } from "../command/send/send.command.js";
import type {
  SimDeleteSuppressedDestinationCommand,
  SimGetSuppressedDestinationCommand,
  SimListSuppressedDestinationsCommand,
  SimPutSuppressedDestinationCommand,
} from "../command/suppression/suppression.command.js";
import type {
  SimCreateEmailTemplateCommand,
  SimDeleteEmailTemplateCommand,
  SimGetEmailTemplateCommand,
  SimListEmailTemplatesCommand,
  SimUpdateEmailTemplateCommand,
} from "../command/template/template.command.js";
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
        "CreateEmailTemplateCommand",
        async (command, context): Promise<unknown> =>
          await simSes.createEmailTemplate(
            command as SimCreateEmailTemplateCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetEmailTemplateCommand",
        async (command, context): Promise<unknown> =>
          await simSes.getEmailTemplate(
            command as SimGetEmailTemplateCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateEmailTemplateCommand",
        async (command, context): Promise<unknown> =>
          await simSes.updateEmailTemplate(
            command as SimUpdateEmailTemplateCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListEmailTemplatesCommand",
        async (command, context): Promise<unknown> =>
          await simSes.listEmailTemplates(
            command as SimListEmailTemplatesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteEmailTemplateCommand",
        async (command, context): Promise<unknown> =>
          await simSes.deleteEmailTemplate(
            command as SimDeleteEmailTemplateCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateConfigurationSetCommand",
        async (command, context): Promise<unknown> =>
          await simSes.createConfigurationSet(
            command as SimCreateConfigurationSetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetConfigurationSetCommand",
        async (command, context): Promise<unknown> =>
          await simSes.getConfigurationSet(
            command as SimGetConfigurationSetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListConfigurationSetsCommand",
        async (command, context): Promise<unknown> =>
          await simSes.listConfigurationSets(
            command as SimListConfigurationSetsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteConfigurationSetCommand",
        async (command, context): Promise<unknown> =>
          await simSes.deleteConfigurationSet(
            command as SimDeleteConfigurationSetCommand,
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
      [
        "PutAccountSuppressionAttributesCommand",
        async (command, context): Promise<unknown> =>
          await simSes.putAccountSuppressionAttributes(
            command as SimPutAccountSuppressionAttributesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutSuppressedDestinationCommand",
        async (command, context): Promise<unknown> =>
          await simSes.putSuppressedDestination(
            command as SimPutSuppressedDestinationCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetSuppressedDestinationCommand",
        async (command, context): Promise<unknown> =>
          await simSes.getSuppressedDestination(
            command as SimGetSuppressedDestinationCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListSuppressedDestinationsCommand",
        async (command, context): Promise<unknown> =>
          await simSes.listSuppressedDestinations(
            command as SimListSuppressedDestinationsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteSuppressedDestinationCommand",
        async (command, context): Promise<unknown> =>
          await simSes.deleteSuppressedDestination(
            command as SimDeleteSuppressedDestinationCommand,
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
