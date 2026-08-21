import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimSesAlreadyExistsException,
  SimSesBadRequestException,
  SimSesNotFoundException,
} from "../error/sim-ses.error.js";
import {
  SimSesConfigurationSet,
  type SimSesConfigurationSetOptions,
} from "./sim-ses-configuration-set.js";

const maximumNameLength = 64;

interface SimSesConfigurationSetStoreProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The configuration sets of one simulated SES scope.
 *
 * Region scoped, as identities and templates are. A set created in one region
 * cannot be sent through from another, which is a mistake worth reproducing.
 */
export class SimSesConfigurationSetStore {
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #configurationSets = new Map<string, SimSesConfigurationSet>();

  constructor(properties: SimSesConfigurationSetStoreProperties) {
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Every configuration set in this scope, in the order they were created.
   */
  get all(): readonly SimSesConfigurationSet[] {
    return this.#configurationSets.values().toArray();
  }

  /**
   * Make a configuration set, refusing a name that is taken.
   */
  create(
    configurationSetName: string,
    options: SimSesConfigurationSetOptions,
  ): SimSesConfigurationSet {
    if (this.#configurationSets.has(configurationSetName)) {
      throw new SimSesAlreadyExistsException(
        `Configuration set ${configurationSetName} already exists.`,
      );
    }

    const configurationSet = new SimSesConfigurationSet({
      configurationSetName,
      options,
      accountRegionScope: this.#accountRegionScope,
    });

    this.#configurationSets.set(configurationSetName, configurationSet);

    return configurationSet;
  }

  /**
   * Find a configuration set by name.
   */
  find(configurationSetName: string): SimSesConfigurationSet | undefined {
    return this.#configurationSets.get(configurationSetName);
  }

  /**
   * Get a configuration set, refusing one that is not there.
   */
  require(configurationSetName: string): SimSesConfigurationSet {
    const configurationSet = this.find(configurationSetName);

    if (configurationSet === undefined) {
      throw new SimSesNotFoundException(
        `Configuration set ${configurationSetName} does not exist.`,
      );
    }

    return configurationSet;
  }

  /**
   * Remove a configuration set.
   */
  delete(configurationSetName: string): void {
    this.#configurationSets.delete(configurationSetName);
  }
}

/**
 * Read a configuration set name, refusing one real SES would refuse.
 *
 * Names are matched exactly, as template names are. `Transactional` and
 * `transactional` are two configuration sets.
 */
export function requiredSimSesConfigurationSetName(
  configurationSetName?: string,
): string {
  if (configurationSetName === undefined || configurationSetName.length === 0) {
    throw new SimSesBadRequestException(
      "1 validation error detected: Value at 'configurationSetName' failed " +
        "to satisfy constraint: Member must not be null",
    );
  }

  if (configurationSetName.length > maximumNameLength) {
    throw new SimSesBadRequestException(
      `1 validation error detected: Value at 'configurationSetName' failed ` +
        `to satisfy constraint: Member must have length less than or equal ` +
        `to ${maximumNameLength}`,
    );
  }

  return configurationSetName;
}
