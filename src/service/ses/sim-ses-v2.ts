import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type * as simSesCommands from "./command/sim-ses-command.types.js";
import type { SimSesRequestOptions } from "./command/sim-ses-request-options.js";
import type { SimSesSentEmail } from "./email/sim-ses-sent-email.js";
import type { SimSesIdentity } from "./identity/sim-ses-identity.js";
import type { SimSesConfigurationSetCommands } from "./command/configuration-set/sim-ses-configuration-set-commands.js";
import type { SimSesIdentityCommands } from "./command/identity/sim-ses-identity-commands.js";
import type { SimSesTemplateCommands } from "./command/template/sim-ses-template-commands.js";
import type { SimSesConfigurationSet } from "./configuration-set/sim-ses-configuration-set.js";
import type { SimSesTemplate } from "./template/sim-ses-template.js";
import { SimSesCfnResourceFactory } from "./cfn/sim-ses-cfn-resource-factory.js";
import { SimSesSdkCommandRouter } from "./sdk/sim-ses-sdk-command-router.js";
import { SimSesCommands, type SimSesV2Properties } from "./sim-ses-commands.js";

/**
 * Simulated Amazon SES, through its v2 API. Handles SDK commands. Emulates AWS
 * behaviour and state.
 *
 * The class is named for the API rather than the service, as simulated ELBv2
 * and API Gateway v2 are, because the v2 API is what it answers: SES has an
 * older API over the same identities and the same account, and if that is ever
 * simulated it belongs beside this in the same directory rather than replacing
 * it.
 *
 * There is nothing to deliver. What a simulator can usefully hold is whether
 * SES would have accepted a message and a record of what it would have sent.
 * That record is what `sentEmails` reads, and it is the point of the service.
 *
 * Identities and sends are region scoped, as they are on real SES: verifying
 * an address in one region verifies nothing in another, and a message sent
 * through one region is invisible from the next.
 *
 * Each SDK command below carries a one line doc comment and reaches its
 * command group through a short field. This file grows by a method per
 * simulated operation and is near the max-lines limit, as `SimDynamoDb` is.
 */
export class SimSesV2 {
  readonly #commands: SimSesCommands;
  readonly #identityApi: SimSesIdentityCommands;
  readonly #templateApi: SimSesTemplateCommands;
  readonly #configurationSetApi: SimSesConfigurationSetCommands;
  readonly #sdkRouter = new SimSesSdkCommandRouter(this);
  readonly #cfnFactory = new SimSesCfnResourceFactory({ ses: this });

  constructor(properties: SimSesV2Properties = {}) {
    this.#commands = new SimSesCommands(properties);
    this.#identityApi = this.#commands.identityCommands;
    this.#templateApi = this.#commands.templateCommands;
    this.#configurationSetApi = this.#commands.configurationSetCommands;
  }

  /**
   * Every message this scope has accepted, oldest first.
   *
   * This is the simulator's own accessor rather than an SES operation. A real
   * account keeps no such record, which is exactly why a test needs one.
   */
  sentEmails(): readonly SimSesSentEmail[] {
    return this.#commands.sent.all;
  }

  /**
   * Find an identity by the address or domain it names.
   *
   * The simulator's own accessor, for tests inspecting identity state without
   * going through a Command and its authorization.
   */
  findIdentity(emailIdentity: string): SimSesIdentity | undefined {
    return this.#commands.identities.find(emailIdentity);
  }

  /** Every identity in this scope, in the order they were created. */
  allIdentities(): readonly SimSesIdentity[] {
    return this.#commands.identities.all;
  }

  /**
   * Treat an identity as having completed verification, creating it if it is
   * not there.
   *
   * This is a deliberate divergence from AWS, and the only way an identity
   * becomes verified here. Real SES verifies an address by emailing it a link
   * and a domain by looking for DNS records, neither of which can happen
   * inside a test process, so the act of proving ownership is the simulator's
   * to perform rather than an API operation to call. Creating a missing
   * identity is the convenience part: verifying is what a test setting up a
   * mailbox actually means.
   */
  verifyIdentity(emailIdentity: string): SimSesIdentity {
    const identity =
      this.#commands.identities.find(emailIdentity) ??
      this.#commands.identities.create(
        emailIdentity,
        this.#commands.background.now(),
      );

    identity.verify();

    return identity;
  }

  /**
   * Find a template by name.
   *
   * The simulator's own accessor, for tests seeding or inspecting template
   * state without going through a Command and its authorization.
   */
  findTemplate(templateName: string): SimSesTemplate | undefined {
    return this.#commands.templates.find(templateName);
  }

  /** Every template in this scope, in the order they were created. */
  allTemplates(): readonly SimSesTemplate[] {
    return this.#commands.templates.all;
  }

  /**
   * Find a configuration set by name, for a test asserting on what a stack
   * declared without going through a Command and its authorization.
   */
  findConfigurationSet(
    configurationSetName: string,
  ): SimSesConfigurationSet | undefined {
    return this.#commands.configurationSets.find(configurationSetName);
  }

  /** Every configuration set in this scope, in the order they were created. */
  allConfigurationSets(): readonly SimSesConfigurationSet[] {
    return this.#commands.configurationSets.all;
  }

  /**
   * Whether this account is still in the SES sandbox, where every recipient
   * has to be verified as well as the sender.
   */
  isInSandbox(): boolean {
    return this.#commands.account.isInSandbox;
  }

  /** Handle a CreateEmailIdentity Command from the SDK. */
  async createEmailIdentity(
    command: simSesCommands.SimCreateEmailIdentityCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimCreateEmailIdentityCommandOutput> {
    await this.#commands.background.sequence();
    return this.#identityApi.createEmailIdentity(command, options);
  }

  /** Handle a GetEmailIdentity Command from the SDK. */
  async getEmailIdentity(
    command: simSesCommands.SimGetEmailIdentityCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimGetEmailIdentityCommandOutput> {
    await this.#commands.background.sequence();
    return this.#identityApi.getEmailIdentity(command, options);
  }

  /** Handle a ListEmailIdentities Command from the SDK. */
  async listEmailIdentities(
    command: simSesCommands.SimListEmailIdentitiesCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimListEmailIdentitiesCommandOutput> {
    await this.#commands.background.sequence();
    return this.#identityApi.listEmailIdentities(command, options);
  }

  /** Handle a DeleteEmailIdentity Command from the SDK. */
  async deleteEmailIdentity(
    command: simSesCommands.SimDeleteEmailIdentityCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimDeleteEmailIdentityCommandOutput> {
    await this.#commands.background.sequence();
    return this.#identityApi.deleteEmailIdentity(command, options);
  }

  /** Handle a CreateEmailTemplate Command from the SDK. */
  async createEmailTemplate(
    command: simSesCommands.SimCreateEmailTemplateCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimCreateEmailTemplateCommandOutput> {
    await this.#commands.background.sequence();
    return this.#templateApi.createEmailTemplate(command, options);
  }

  /** Handle a GetEmailTemplate Command from the SDK. */
  async getEmailTemplate(
    command: simSesCommands.SimGetEmailTemplateCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimGetEmailTemplateCommandOutput> {
    await this.#commands.background.sequence();
    return this.#templateApi.getEmailTemplate(command, options);
  }

  /** Handle an UpdateEmailTemplate Command from the SDK. */
  async updateEmailTemplate(
    command: simSesCommands.SimUpdateEmailTemplateCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimUpdateEmailTemplateCommandOutput> {
    await this.#commands.background.sequence();
    return this.#templateApi.updateEmailTemplate(command, options);
  }

  /** Handle a ListEmailTemplates Command from the SDK. */
  async listEmailTemplates(
    command: simSesCommands.SimListEmailTemplatesCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimListEmailTemplatesCommandOutput> {
    await this.#commands.background.sequence();
    return this.#templateApi.listEmailTemplates(command, options);
  }

  /** Handle a DeleteEmailTemplate Command from the SDK. */
  async deleteEmailTemplate(
    command: simSesCommands.SimDeleteEmailTemplateCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimDeleteEmailTemplateCommandOutput> {
    await this.#commands.background.sequence();
    return this.#templateApi.deleteEmailTemplate(command, options);
  }

  /** Handle a CreateConfigurationSet Command from the SDK. */
  async createConfigurationSet(
    command: simSesCommands.SimCreateConfigurationSetCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimCreateConfigurationSetCommandOutput> {
    await this.#commands.background.sequence();
    return this.#configurationSetApi.createConfigurationSet(command, options);
  }

  /** Handle a GetConfigurationSet Command from the SDK. */
  async getConfigurationSet(
    command: simSesCommands.SimGetConfigurationSetCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimGetConfigurationSetCommandOutput> {
    await this.#commands.background.sequence();
    return this.#configurationSetApi.getConfigurationSet(command, options);
  }

  /** Handle a ListConfigurationSets Command from the SDK. */
  async listConfigurationSets(
    command: simSesCommands.SimListConfigurationSetsCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimListConfigurationSetsCommandOutput> {
    await this.#commands.background.sequence();
    return this.#configurationSetApi.listConfigurationSets(command, options);
  }

  /** Handle a DeleteConfigurationSet Command from the SDK. */
  async deleteConfigurationSet(
    command: simSesCommands.SimDeleteConfigurationSetCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimDeleteConfigurationSetCommandOutput> {
    await this.#commands.background.sequence();
    return this.#configurationSetApi.deleteConfigurationSet(command, options);
  }

  /** Handle a SendEmail Command from the SDK. */
  async sendEmail(
    command: simSesCommands.SimSendEmailCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimSendEmailCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.sendEmail.handle(command, options);
  }

  /** Handle a GetAccount Command from the SDK. */
  async getAccount(
    _command?: simSesCommands.SimGetAccountCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimGetAccountCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.accountCommands.getAccount(options);
  }

  /** Handle a PutAccountDetails Command from the SDK. */
  async putAccountDetails(
    command: simSesCommands.SimPutAccountDetailsCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimPutAccountDetailsCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.accountCommands.putAccountDetails(command, options);
  }

  /**
   * Get the CloudFormation Resource factory for AWS::SES::* Resources.
   */
  cfnResourceFactory(): SimSesCfnResourceFactory {
    return this.#cfnFactory;
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.#sdkRouter;
  }
}
