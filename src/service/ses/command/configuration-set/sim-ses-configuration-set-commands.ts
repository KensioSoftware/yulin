import {
  requiredSimSesConfigurationSetName,
  type SimSesConfigurationSetStore,
} from "../../configuration-set/sim-ses-configuration-set-store.js";
import type { SimSesConfigurationSet } from "../../configuration-set/sim-ses-configuration-set.js";
import type { SimSesAuthorizer } from "../authorize/sim-ses-authorizer.js";
import { SimSesPage } from "../sim-ses-page.js";
import type { SimSesRequestOptions } from "../sim-ses-request-options.js";
import type {
  SimCreateConfigurationSetCommand,
  SimCreateConfigurationSetCommandOutput,
  SimDeleteConfigurationSetCommand,
  SimDeleteConfigurationSetCommandOutput,
  SimGetConfigurationSetCommand,
  SimGetConfigurationSetCommandOutput,
  SimListConfigurationSetsCommand,
  SimListConfigurationSetsCommandOutput,
} from "./configuration-set.command.js";
import { readSimSesConfigurationSetOptions } from "./sim-ses-configuration-set-options.js";
import { refuseUnsimulatedConfigurationSetInput } from "./sim-ses-unsimulated-configuration-set-input.js";

interface SimSesConfigurationSetCommandsProperties {
  readonly configurationSets: SimSesConfigurationSetStore;
  readonly authorizer: SimSesAuthorizer;
}

/**
 * The commands that make, read, list and remove configuration sets.
 *
 * Every one but the listing names a set, and each authorizes against that
 * set's ARN, so a policy can allow a caller to manage one set and not the
 * others.
 *
 * There is no update command here. Real SES changes a set through a `Put`
 * command per group of options, and none of those is simulated yet, so a set
 * holds what it was created with.
 */
export class SimSesConfigurationSetCommands {
  readonly #configurationSets: SimSesConfigurationSetStore;
  readonly #authorizer: SimSesAuthorizer;

  constructor(properties: SimSesConfigurationSetCommandsProperties) {
    this.#configurationSets = properties.configurationSets;
    this.#authorizer = properties.authorizer;
  }

  /**
   * Store a configuration set.
   */
  createConfigurationSet(
    command: SimCreateConfigurationSetCommand,
    options?: SimSesRequestOptions,
  ): SimCreateConfigurationSetCommandOutput {
    refuseUnsimulatedConfigurationSetInput(command.input);

    this.#configurationSets.create(
      this.named("ses:CreateConfigurationSet", command.input, options),
      readSimSesConfigurationSetOptions(command.input),
    );

    return { $metadata: {} };
  }

  /**
   * Read a configuration set's settings back.
   */
  getConfigurationSet(
    command: SimGetConfigurationSetCommand,
    options?: SimSesRequestOptions,
  ): SimGetConfigurationSetCommandOutput {
    const configurationSet = this.#configurationSets.require(
      this.named("ses:GetConfigurationSet", command.input, options),
    );

    return { $metadata: {}, ...reported(configurationSet) };
  }

  /**
   * List the configuration sets in this scope, in the order they were made.
   *
   * Real SES lists names alone, so a caller after a set's settings reads them
   * one at a time with GetConfigurationSet. The action has no resource type,
   * so it authorizes against `*` as the other listings do.
   */
  listConfigurationSets(
    command: SimListConfigurationSetsCommand,
    options?: SimSesRequestOptions,
  ): SimListConfigurationSetsCommandOutput {
    this.#authorizer.authorizeNoResource(
      "ses:ListConfigurationSets",
      options?.caller,
    );

    const page = new SimSesPage({
      listed: this.#configurationSets.all,
      pageSize: command.input.PageSize,
      nextToken: command.input.NextToken,
    });

    return {
      $metadata: {},
      ConfigurationSets: page.items.map(
        (configurationSet) => configurationSet.configurationSetName,
      ),
      NextToken: page.nextToken,
    };
  }

  /**
   * Remove a configuration set, refusing one that is not there.
   */
  deleteConfigurationSet(
    command: SimDeleteConfigurationSetCommand,
    options?: SimSesRequestOptions,
  ): SimDeleteConfigurationSetCommandOutput {
    const configurationSetName = this.named(
      "ses:DeleteConfigurationSet",
      command.input,
      options,
    );

    this.#configurationSets.require(configurationSetName);
    this.#configurationSets.delete(configurationSetName);

    return { $metadata: {} };
  }

  /**
   * The configuration set name a request carries, once it is one SES would
   * accept and the caller is allowed to act on it.
   *
   * The set need not exist. Real IAM decides a request before the service
   * looks at it, so CreateConfigurationSet authorizes against the ARN the set
   * is about to have, and the rest refuse a caller with no permission whether
   * or not the set is there.
   */
  private named(
    action: string,
    input: { readonly ConfigurationSetName?: string | undefined },
    options: SimSesRequestOptions | undefined,
  ): string {
    const configurationSetName = requiredSimSesConfigurationSetName(
      input.ConfigurationSetName,
    );

    this.#authorizer.authorizeConfigurationSet(
      action,
      configurationSetName,
      options?.caller,
    );

    return configurationSetName;
  }
}

/**
 * What GetConfigurationSet answers with.
 *
 * Every group is reported, including the ones the set never declared, because
 * real SES answers with the defaults it applied rather than leaving them out.
 */
function reported(
  configurationSet: SimSesConfigurationSet,
): Omit<SimGetConfigurationSetCommandOutput, "$metadata"> {
  return {
    ConfigurationSetName: configurationSet.configurationSetName,
    SuppressionOptions: {
      SuppressedReasons: configurationSet.suppressedReasons,
    },
    SendingOptions: { SendingEnabled: configurationSet.sendingEnabled },
    DeliveryOptions: {
      TlsPolicy: configurationSet.deliveryOptions.tlsPolicy,
      SendingPoolName: configurationSet.deliveryOptions.sendingPoolName,
      MaxDeliverySeconds: configurationSet.deliveryOptions.maxDeliverySeconds,
    },
    ReputationOptions: {
      ReputationMetricsEnabled:
        configurationSet.reputationOptions.reputationMetricsEnabled,
    },
  };
}
