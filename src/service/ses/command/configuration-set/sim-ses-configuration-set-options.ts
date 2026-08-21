import {
  simSesSuppressedReasons,
  type SimSesConfigurationSetDeliveryOptions,
  type SimSesConfigurationSetOptions,
  type SimSesSuppressedReason,
} from "../../configuration-set/sim-ses-configuration-set.js";
import {
  SimSesBadRequestException,
  SimSesUnsupportedOperationException,
} from "../../error/sim-ses.error.js";
import type {
  SimCreateConfigurationSetCommandInput,
  SimSesDeliveryOptions,
} from "./configuration-set.command.js";

/** What real SES uses where a set declares no TLS policy. */
const defaultTlsPolicy = "OPTIONAL";

const tlsPolicies = new Set(["REQUIRE", "OPTIONAL"]);

/**
 * Read what a configuration set is being given, refusing what real SES
 * refuses.
 *
 * A set declaring none of these gets the defaults real SES applies: sending
 * on, no suppression reasons, optional TLS and no reputation metrics.
 */
export function readSimSesConfigurationSetOptions(
  input: SimCreateConfigurationSetCommandInput,
): SimSesConfigurationSetOptions {
  return {
    suppressedReasons: readSuppressedReasons(
      input.SuppressionOptions?.SuppressedReasons,
    ),
    sendingEnabled: input.SendingOptions?.SendingEnabled ?? true,
    deliveryOptions: readDeliveryOptions(input.DeliveryOptions),
    reputationOptions: {
      reputationMetricsEnabled:
        input.ReputationOptions?.ReputationMetricsEnabled ?? false,
    },
  };
}

/**
 * Refuse the CreateConfigurationSet inputs this simulation does not model.
 *
 * Open and click tracking needs a tracking domain and the events that report
 * a click, and the Virtual Deliverability Manager needs engagement this
 * simulation never measures. Accepting either and dropping it would let a set
 * look configured to the request that made it and unconfigured to everything
 * else.
 */
export function refuseUnsimulatedConfigurationSetInput(
  input: SimCreateConfigurationSetCommandInput,
): void {
  if (input.TrackingOptions !== undefined) {
    throw new SimSesUnsupportedOperationException(
      "Open and click tracking is not simulated, so CreateConfigurationSet " +
        "refuses TrackingOptions rather than reporting a redirect domain no " +
        "message here is rewritten for",
    );
  }

  if (input.VdmOptions !== undefined) {
    throw new SimSesUnsupportedOperationException(
      "The Virtual Deliverability Manager is not simulated, so " +
        "CreateConfigurationSet refuses VdmOptions rather than reporting " +
        "engagement metrics nothing here measures",
    );
  }

  if (input.Tags !== undefined && input.Tags.length > 0) {
    throw new SimSesUnsupportedOperationException(
      "Configuration set tags are not simulated, so CreateConfigurationSet " +
        "refuses them rather than dropping them",
    );
  }
}

/**
 * The suppression reasons a set names, refusing one SES has no meaning for.
 *
 * An absent `SuppressionOptions` leaves this empty. Real SES falls back to the
 * account-level setting there, and this simulation has no account suppression
 * list to fall back to.
 */
function readSuppressedReasons(
  reasons: readonly string[] | undefined,
): readonly SimSesSuppressedReason[] {
  if (reasons === undefined) {
    return [];
  }

  return reasons.map((reason) => {
    if (!isSuppressedReason(reason)) {
      throw new SimSesBadRequestException(
        `1 validation error detected: Value '${reason}' at ` +
          `'suppressionOptions.suppressedReasons' failed to satisfy ` +
          `constraint: Member must satisfy enum value set: ` +
          `[${simSesSuppressedReasons.join(", ")}]`,
      );
    }

    return reason;
  });
}

function isSuppressedReason(reason: string): reason is SimSesSuppressedReason {
  return simSesSuppressedReasons.includes(reason as SimSesSuppressedReason);
}

function readDeliveryOptions(
  options: SimSesDeliveryOptions | undefined,
): SimSesConfigurationSetDeliveryOptions {
  const tlsPolicy = options?.TlsPolicy ?? defaultTlsPolicy;

  if (!tlsPolicies.has(tlsPolicy)) {
    throw new SimSesBadRequestException(
      `1 validation error detected: Value '${tlsPolicy}' at ` +
        `'deliveryOptions.tlsPolicy' failed to satisfy constraint: Member ` +
        `must satisfy enum value set: [REQUIRE, OPTIONAL]`,
    );
  }

  return {
    tlsPolicy: tlsPolicy === "REQUIRE" ? "REQUIRE" : defaultTlsPolicy,
    sendingPoolName: options?.SendingPoolName,
    maxDeliverySeconds: options?.MaxDeliverySeconds,
  };
}
