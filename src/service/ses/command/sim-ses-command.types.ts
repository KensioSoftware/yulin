/**
 * The sim SES v2 Command types, gathered for the service facade.
 */
export type {
  SimCreateEmailIdentityCommand,
  SimCreateEmailIdentityCommandInput,
  SimCreateEmailIdentityCommandOutput,
  SimDeleteEmailIdentityCommand,
  SimDeleteEmailIdentityCommandInput,
  SimDeleteEmailIdentityCommandOutput,
  SimGetEmailIdentityCommand,
  SimGetEmailIdentityCommandInput,
  SimGetEmailIdentityCommandOutput,
  SimListEmailIdentitiesCommand,
  SimListEmailIdentitiesCommandInput,
  SimListEmailIdentitiesCommandOutput,
  SimSesIdentityInfo,
  SimSesVerificationStatusValue,
} from "./identity/identity.command.js";
export type {
  SimSendEmailCommand,
  SimSendEmailCommandInput,
  SimSendEmailCommandOutput,
  SimSesBody,
  SimSesContent,
  SimSesDestination,
  SimSesEmailContent,
  SimSesMessage,
  SimSesRawMessage,
  SimSesTemplate,
} from "./send/send.command.js";
export type {
  SimGetAccountCommand,
  SimGetAccountCommandOutput,
  SimPutAccountDetailsCommand,
  SimPutAccountDetailsCommandInput,
  SimPutAccountDetailsCommandOutput,
  SimSesAccountDetailsOutput,
  SimSesSendQuotaDetail,
} from "./account/account.command.js";
