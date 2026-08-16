import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimSesIdentityStore } from "../../identity/sim-ses-identity-store.js";
import { requiredSimSesIdentityName } from "../../identity/sim-ses-identity-name.js";
import type { SimSesIdentity } from "../../identity/sim-ses-identity.js";
import type { SimSesAuthorizer } from "../authorize/sim-ses-authorizer.js";
import { SimSesPage } from "../sim-ses-page.js";
import type { SimSesRequestOptions } from "../sim-ses-request-options.js";
import type {
  SimCreateEmailIdentityCommand,
  SimCreateEmailIdentityCommandOutput,
  SimDeleteEmailIdentityCommand,
  SimDeleteEmailIdentityCommandOutput,
  SimGetEmailIdentityCommand,
  SimGetEmailIdentityCommandOutput,
  SimListEmailIdentitiesCommand,
  SimListEmailIdentitiesCommandOutput,
  SimSesIdentityInfo,
} from "./identity.command.js";
import { refuseUnsimulatedIdentityInput } from "./sim-ses-unsimulated-identity-input.js";

interface SimSesIdentityCommandsProperties {
  readonly identities: SimSesIdentityStore;
  readonly authorizer: SimSesAuthorizer;
  readonly clock: SimClock;
}

/**
 * The commands that make, read, list and remove email identities.
 *
 * A new identity is never verified. Real SES starts one pending and waits on
 * an emailed link or a DNS record, so a test that creates an identity and
 * sends from it straight away should see the same refusal an account gives,
 * rather than a simulator being helpful.
 */
export class SimSesIdentityCommands {
  readonly #identities: SimSesIdentityStore;
  readonly #authorizer: SimSesAuthorizer;
  readonly #clock: SimClock;

  constructor(properties: SimSesIdentityCommandsProperties) {
    this.#identities = properties.identities;
    this.#authorizer = properties.authorizer;
    this.#clock = properties.clock;
  }

  /**
   * Begin verifying an email address or a domain.
   */
  createEmailIdentity(
    command: SimCreateEmailIdentityCommand,
    options?: SimSesRequestOptions,
  ): SimCreateEmailIdentityCommandOutput {
    const emailIdentity = requiredSimSesIdentityName(
      command.input.EmailIdentity,
    );

    refuseUnsimulatedIdentityInput(command.input);
    this.#authorizer.authorizeIdentity(
      "ses:CreateEmailIdentity",
      emailIdentity,
      options?.caller,
    );

    const identity = this.#identities.create(emailIdentity, this.#clock.now());

    return {
      $metadata: {},
      IdentityType: identity.identityType,
      VerifiedForSendingStatus: identity.isVerified,
    };
  }

  /**
   * Read one identity and how far its verification has got.
   */
  getEmailIdentity(
    command: SimGetEmailIdentityCommand,
    options?: SimSesRequestOptions,
  ): SimGetEmailIdentityCommandOutput {
    const emailIdentity = requiredSimSesIdentityName(
      command.input.EmailIdentity,
    );

    this.#authorizer.authorizeIdentity(
      "ses:GetEmailIdentity",
      emailIdentity,
      options?.caller,
    );

    const identity = this.#identities.require(emailIdentity);

    return {
      $metadata: {},
      IdentityType: identity.identityType,
      VerifiedForSendingStatus: identity.isVerified,
      VerificationStatus: identity.verificationStatus,
      FeedbackForwardingStatus: true,
    };
  }

  /**
   * List the identities in this scope, in the order they were created.
   *
   * Real SES gives this action no resource type at all, so it authorizes
   * against `*`: a policy scoped to identity ARNs allows no listing, however
   * broadly those ARNs are written.
   */
  listEmailIdentities(
    command: SimListEmailIdentitiesCommand,
    options?: SimSesRequestOptions,
  ): SimListEmailIdentitiesCommandOutput {
    this.#authorizer.authorizeNoResource(
      "ses:ListEmailIdentities",
      options?.caller,
    );

    const page = new SimSesPage({
      listed: this.#identities.all,
      pageSize: command.input.PageSize,
      nextToken: command.input.NextToken,
    });

    return {
      $metadata: {},
      EmailIdentities: page.items.map((identity) => identityInfo(identity)),
      NextToken: page.nextToken,
    };
  }

  /**
   * Remove an identity, refusing one that is not there.
   */
  deleteEmailIdentity(
    command: SimDeleteEmailIdentityCommand,
    options?: SimSesRequestOptions,
  ): SimDeleteEmailIdentityCommandOutput {
    const emailIdentity = requiredSimSesIdentityName(
      command.input.EmailIdentity,
    );

    this.#authorizer.authorizeIdentity(
      "ses:DeleteEmailIdentity",
      emailIdentity,
      options?.caller,
    );

    this.#identities.require(emailIdentity);
    this.#identities.delete(emailIdentity);

    return { $metadata: {} };
  }
}

/**
 * What ListEmailIdentities reports about one identity.
 */
function identityInfo(identity: SimSesIdentity): SimSesIdentityInfo {
  return {
    IdentityType: identity.identityType,
    IdentityName: identity.emailIdentity,
    SendingEnabled: identity.isVerified,
    VerificationStatus: identity.verificationStatus,
  };
}
