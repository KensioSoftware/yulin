import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimSesAccount } from "../../account/sim-ses-account.js";
import { simSesBareAddress } from "../../email/sim-ses-address.js";
import { SimSesMessageRejected } from "../../error/sim-ses.error.js";
import type { SimSesIdentityStore } from "../../identity/sim-ses-identity-store.js";

interface SimSesVerifiedIdentityCheckProperties {
  readonly identities: SimSesIdentityStore;
  readonly account: SimSesAccount;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

interface SimSesCheckedSend {
  readonly fromEmailAddress: string;
  readonly recipients: readonly string[];
}

/**
 * The identity check every send goes through.
 *
 * Two rules apply, and which of them apply depends on the account. The sender
 * is always checked, in the sandbox and out of it: SES will not send from an
 * address nobody has proved they own. Recipients are checked only in the
 * sandbox, and that is the rule the sandbox is really for, since it is what
 * stops a new account mailing the world.
 *
 * Failures are gathered rather than reported one at a time, because real SES
 * names every identity that failed in a single message and a caller reading
 * that message wants the whole list.
 */
export class SimSesVerifiedIdentityCheck {
  readonly #identities: SimSesIdentityStore;
  readonly #account: SimSesAccount;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimSesVerifiedIdentityCheckProperties) {
    this.#identities = properties.identities;
    this.#account = properties.account;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Refuse a send whose sender, or whose recipients in the sandbox, are not
   * verified.
   */
  check(send: SimSesCheckedSend): void {
    const checked = this.#account.isInSandbox
      ? [send.fromEmailAddress, ...send.recipients]
      : [send.fromEmailAddress];

    const failed = checked
      .map((address) => simSesBareAddress(address))
      .filter((address) => !this.#identities.isAddressVerified(address));

    if (failed.length === 0) {
      return;
    }

    throw new SimSesMessageRejected(
      `Email address is not verified. The following identities failed the ` +
        `check in region ${this.#reportedRegion}: ${[...new Set(failed)].join(", ")}`,
    );
  }

  /**
   * How SES writes the region into that message: upper case, as in
   * `US-EAST-1`.
   */
  get #reportedRegion(): string {
    return this.#accountRegionScope.regionName.toUpperCase();
  }
}
