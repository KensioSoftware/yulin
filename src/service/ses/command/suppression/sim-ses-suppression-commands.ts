import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { requiredSimSesSuppressionAddress } from "../../suppression/sim-ses-suppression-address.js";
import { requiredSimSesSuppressionReason } from "../../suppression/sim-ses-suppression-reason.js";
import type { SimSesSuppressionList } from "../../suppression/sim-ses-suppression-list.js";
import type { SimSesAuthorizer } from "../authorize/sim-ses-authorizer.js";
import { SimSesPage } from "../sim-ses-page.js";
import type { SimSesRequestOptions } from "../sim-ses-request-options.js";
import {
  selectedSimSesSuppressed,
  simSesSuppressedDetail,
} from "./sim-ses-suppression-listing.js";
import { refuseSimSesTenantName } from "./sim-ses-unsimulated-suppression-input.js";
import type {
  SimDeleteSuppressedDestinationCommand,
  SimDeleteSuppressedDestinationCommandOutput,
  SimGetSuppressedDestinationCommand,
  SimGetSuppressedDestinationCommandOutput,
  SimListSuppressedDestinationsCommand,
  SimListSuppressedDestinationsCommandOutput,
  SimPutSuppressedDestinationCommand,
  SimPutSuppressedDestinationCommandOutput,
} from "./suppression.command.js";

interface SimSesSuppressionCommandsProperties {
  readonly suppression: SimSesSuppressionList;
  readonly authorizer: SimSesAuthorizer;
  readonly clock: SimClock;
}

/**
 * The commands that manage the account-level suppression list.
 *
 * All four authorize against `*`. The only resource type real SES gives them
 * is a tenant, which is not simulated, so a policy scoped to identity ARNs
 * allows none of them.
 *
 * Real SES refuses `PutSuppressedDestination` until an account leaves the
 * sandbox. Nothing here does. The sandbox is kept so that a send to an
 * unverified recipient fails the way it would in an account, and making every
 * test that seeds this list leave the sandbox first buys nothing.
 */
export class SimSesSuppressionCommands {
  readonly #suppression: SimSesSuppressionList;
  readonly #authorizer: SimSesAuthorizer;
  readonly #clock: SimClock;

  constructor(properties: SimSesSuppressionCommandsProperties) {
    this.#suppression = properties.suppression;
    this.#authorizer = properties.authorizer;
    this.#clock = properties.clock;
  }

  /**
   * Put an address on the list, replacing the reason of one already there.
   */
  putSuppressedDestination(
    command: SimPutSuppressedDestinationCommand,
    options?: SimSesRequestOptions,
  ): SimPutSuppressedDestinationCommandOutput {
    const emailAddress = requiredSimSesSuppressionAddress(
      command.input.EmailAddress,
    );
    const reason = requiredSimSesSuppressionReason(command.input.Reason);

    refuseSimSesTenantName(command.input.TenantName);
    this.#authorizer.authorizeNoResource(
      "ses:PutSuppressedDestination",
      options?.caller,
    );

    this.#suppression.put(emailAddress, reason, this.#clock.now());

    return { $metadata: {} };
  }

  /**
   * Read one address off the list, refusing one that is not on it.
   */
  getSuppressedDestination(
    command: SimGetSuppressedDestinationCommand,
    options?: SimSesRequestOptions,
  ): SimGetSuppressedDestinationCommandOutput {
    const emailAddress = requiredSimSesSuppressionAddress(
      command.input.EmailAddress,
    );

    refuseSimSesTenantName(command.input.TenantName);
    this.#authorizer.authorizeNoResource(
      "ses:GetSuppressedDestination",
      options?.caller,
    );

    return {
      $metadata: {},
      SuppressedDestination: simSesSuppressedDetail(
        this.#suppression.require(emailAddress),
      ),
    };
  }

  /**
   * List the addresses on the account's suppression list.
   */
  listSuppressedDestinations(
    command: SimListSuppressedDestinationsCommand,
    options?: SimSesRequestOptions,
  ): SimListSuppressedDestinationsCommandOutput {
    const input = command.input ?? {};

    refuseSimSesTenantName(input.TenantName);
    this.#authorizer.authorizeNoResource(
      "ses:ListSuppressedDestinations",
      options?.caller,
    );

    const page = new SimSesPage({
      listed: selectedSimSesSuppressed(this.#suppression.all, input),
      pageSize: input.PageSize,
      nextToken: input.NextToken,
    });

    return {
      $metadata: {},
      SuppressedDestinationSummaries: page.items.map((suppressed) =>
        simSesSuppressedDetail(suppressed),
      ),
      NextToken: page.nextToken,
    };
  }

  /**
   * Take an address off the list.
   */
  deleteSuppressedDestination(
    command: SimDeleteSuppressedDestinationCommand,
    options?: SimSesRequestOptions,
  ): SimDeleteSuppressedDestinationCommandOutput {
    const emailAddress = requiredSimSesSuppressionAddress(
      command.input.EmailAddress,
    );

    refuseSimSesTenantName(command.input.TenantName);
    this.#authorizer.authorizeNoResource(
      "ses:DeleteSuppressedDestination",
      options?.caller,
    );

    this.#suppression.delete(emailAddress);

    return { $metadata: {} };
  }
}
