import { simSesBareAddress } from "../../email/sim-ses-address.js";
import type { SimSesConfigurationSetStore } from "../../configuration-set/sim-ses-configuration-set-store.js";
import { SimSesSendingPausedException } from "../../error/sim-ses.error.js";
import type { SimSesIdentityStore } from "../../identity/sim-ses-identity-store.js";

interface SimSesConfigurationSetCheckProperties {
  readonly identities: SimSesIdentityStore;
  readonly configurationSets: SimSesConfigurationSetStore;
}

interface SimSesConfiguredSend {
  readonly fromEmailAddress: string;
  readonly configurationSetName: string | undefined;
}

/**
 * Which configuration set a send goes through, and whether it may.
 *
 * A send names its own set, and one that names none falls back to the set the
 * sending identity was created with. That fallback is how an application
 * attaching a set to an identity behaves, and it lets a test assert a message
 * went through the right set without the send naming it.
 *
 * A name nothing created is still accepted. Real SES refuses one, and refusing
 * here would fail a test over a set the developer left out of their local
 * setup. A test wanting the strict reading asks `findConfigurationSet` for the
 * set and finds nothing.
 *
 * `SendingEnabled` is the one option acted on. It is a switch the caller wrote
 * deliberately. A send through a set that has it off is refused the way SES
 * refuses one.
 */
export class SimSesConfigurationSetCheck {
  readonly #identities: SimSesIdentityStore;
  readonly #configurationSets: SimSesConfigurationSetStore;

  constructor(properties: SimSesConfigurationSetCheckProperties) {
    this.#identities = properties.identities;
    this.#configurationSets = properties.configurationSets;
  }

  /**
   * The set this send is made through, or nothing where neither the send nor
   * the identity names one.
   *
   * Which identity's set counts follows the rule IAM authorizes an address
   * against. An address identity's set wins over its domain's.
   */
  applying(send: SimSesConfiguredSend): string | undefined {
    if (send.configurationSetName !== undefined) {
      return send.configurationSetName;
    }

    const address = simSesBareAddress(send.fromEmailAddress);

    return this.#identities.find(this.#identities.covering(address))?.settings
      .configurationSetName;
  }

  /**
   * Refuse a send through a set whose sending is switched off.
   */
  check(configurationSetName: string | undefined): void {
    const refusal = this.refusal(configurationSetName);

    if (refusal !== undefined) {
      throw new SimSesSendingPausedException(refusal);
    }
  }

  /**
   * Why SES would turn this send down, or nothing where it would take it.
   *
   * The identity check offers a reason alongside its exception, and this
   * offers both for the same purpose. A service sending on the account's
   * behalf reports the refusal in its own vocabulary.
   */
  refusal(configurationSetName: string | undefined): string | undefined {
    if (configurationSetName === undefined) {
      return undefined;
    }

    const configurationSet = this.#configurationSets.find(configurationSetName);

    if (configurationSet === undefined || configurationSet.sendingEnabled) {
      return undefined;
    }

    return (
      `Email sending is disabled for configuration set ` +
      `${configurationSetName}.`
    );
  }
}
