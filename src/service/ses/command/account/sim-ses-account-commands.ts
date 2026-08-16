import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimSesAccount } from "../../account/sim-ses-account.js";
import type { SimSesSentEmailStore } from "../../email/sim-ses-sent-email-store.js";
import type { SimSesAuthorizer } from "../authorize/sim-ses-authorizer.js";
import type { SimSesRequestOptions } from "../sim-ses-request-options.js";
import type {
  SimGetAccountCommandOutput,
  SimPutAccountDetailsCommand,
  SimPutAccountDetailsCommandOutput,
} from "./account.command.js";
import { readSimSesAccountDetails } from "./sim-ses-account-details-input.js";
import { simSesAccountReport } from "./sim-ses-account-report.js";

interface SimSesAccountCommandsProperties {
  readonly account: SimSesAccount;
  readonly sent: SimSesSentEmailStore;
  readonly authorizer: SimSesAuthorizer;
  readonly clock: SimClock;
}

/**
 * The commands that read and change what a whole SES account may do.
 *
 * Both authorize against `*`, because real SES gives neither a resource type:
 * only a policy written against every resource allows them, and one naming an
 * identity ARN allows neither.
 */
export class SimSesAccountCommands {
  readonly #account: SimSesAccount;
  readonly #sent: SimSesSentEmailStore;
  readonly #authorizer: SimSesAuthorizer;
  readonly #clock: SimClock;

  constructor(properties: SimSesAccountCommandsProperties) {
    this.#account = properties.account;
    this.#sent = properties.sent;
    this.#authorizer = properties.authorizer;
    this.#clock = properties.clock;
  }

  /**
   * Report what this account may do, including whether it is still in the
   * sandbox.
   */
  getAccount(options?: SimSesRequestOptions): SimGetAccountCommandOutput {
    this.#authorizer.authorizeNoResource("ses:GetAccount", options?.caller);

    return simSesAccountReport({
      account: this.#account,
      sentLast24Hours: this.#sent.countSentSince(this.#clock.now()),
    });
  }

  /**
   * Record the account details, and leave the sandbox if they ask to.
   */
  putAccountDetails(
    command: SimPutAccountDetailsCommand,
    options?: SimSesRequestOptions,
  ): SimPutAccountDetailsCommandOutput {
    this.#authorizer.authorizeNoResource(
      "ses:PutAccountDetails",
      options?.caller,
    );

    this.#account.putDetails(
      readSimSesAccountDetails(command.input),
      command.input.ProductionAccessEnabled ?? false,
    );

    return { $metadata: {} };
  }
}
