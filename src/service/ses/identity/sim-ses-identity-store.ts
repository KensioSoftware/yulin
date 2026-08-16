import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimSesAlreadyExistsException,
  SimSesNotFoundException,
} from "../error/sim-ses.error.js";
import {
  simSesIdentityDomain,
  simSesIdentityKey,
} from "./sim-ses-identity-name.js";
import { SimSesIdentity } from "./sim-ses-identity.js";

interface SimSesIdentityStoreProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The email identities of one simulated SES scope.
 *
 * Identities are region scoped on real SES: verifying an address in one region
 * verifies nothing in another, which is a mistake worth reproducing rather
 * than smoothing over.
 */
export class SimSesIdentityStore {
  readonly #accountRegionScope: SimAwsAccountRegionScope;
  readonly #identities = new Map<string, SimSesIdentity>();

  constructor(properties: SimSesIdentityStoreProperties) {
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Every identity in this scope, in the order they were created.
   */
  get all(): readonly SimSesIdentity[] {
    return this.#identities.values().toArray();
  }

  /**
   * Make an identity, refusing one that is already there.
   */
  create(emailIdentity: string, createdDate: Date): SimSesIdentity {
    const key = simSesIdentityKey(emailIdentity);

    if (this.#identities.has(key)) {
      throw new SimSesAlreadyExistsException(
        `Email identity ${emailIdentity} already exists.`,
      );
    }

    const identity = new SimSesIdentity({
      emailIdentity,
      accountRegionScope: this.#accountRegionScope,
      createdDate,
    });

    this.#identities.set(key, identity);

    return identity;
  }

  /**
   * Find an identity by the address or domain it names.
   */
  find(emailIdentity: string): SimSesIdentity | undefined {
    return this.#identities.get(simSesIdentityKey(emailIdentity));
  }

  /**
   * Get an identity, refusing one that is not there.
   */
  require(emailIdentity: string): SimSesIdentity {
    const identity = this.find(emailIdentity);

    if (identity === undefined) {
      throw new SimSesNotFoundException(
        `Email identity ${emailIdentity} does not exist.`,
      );
    }

    return identity;
  }

  /**
   * The identity an address belongs to, whether or not it is verified.
   *
   * This is what IAM authorizes an operation on an address against, and the
   * more specific of the two wins: a policy naming `identity/hello@example.com`
   * covers a send from that address, and one naming `identity/example.com`
   * covers a send from any address at the domain. A parent domain does not
   * cover a subdomain, here or on real SES.
   *
   * An address nothing covers falls back to the address itself, since IAM
   * evaluates a request before the service looks at it and has to authorize
   * against something either way.
   */
  covering(address: string): string {
    return (
      this.find(address)?.emailIdentity ??
      this.find(simSesIdentityDomain(address))?.emailIdentity ??
      address
    );
  }

  /**
   * Whether SES would accept mail from or to an address.
   *
   * An address is verified if an identity for the address itself is, or if one
   * for its domain is: verifying `example.com` lets every mailbox at it send,
   * which is the whole reason domain identities exist. Either will do, so an
   * address identity still waiting on its link sends anyway once its domain is
   * verified.
   */
  isAddressVerified(address: string): boolean {
    return (
      this.find(address)?.isVerified === true ||
      this.find(simSesIdentityDomain(address))?.isVerified === true
    );
  }

  /**
   * Remove an identity.
   */
  delete(emailIdentity: string): void {
    this.#identities.delete(simSesIdentityKey(emailIdentity));
  }
}
