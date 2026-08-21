import {
  simSesSuppressedReasons,
  type SimSesConfigurationSetDeliveryOptions,
  type SimSesConfigurationSetOptions,
  type SimSesSuppressedReason,
} from "../../configuration-set/sim-ses-configuration-set.js";
import { SimSesBadRequestException } from "../../error/sim-ses.error.js";
import type {
  SimCreateConfigurationSetCommandInput,
  SimSesDeliveryOptions,
} from "./configuration-set.command.js";

/** What real SES uses where a set declares no TLS policy. */
const defaultTlsPolicy = "OPTIONAL";

/** How long real SES will go on attempting delivery, at either end. */
const minimumDeliverySeconds = 300;

const maximumDeliverySeconds = 50_400;

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
    maxDeliverySeconds: readMaxDeliverySeconds(options?.MaxDeliverySeconds),
  };
}

/**
 * How long SES will go on attempting delivery for, refusing what SES refuses.
 *
 * Real SES takes whole seconds between five minutes and fourteen hours. A
 * value outside that is refused rather than held, because a set reporting one
 * back would describe a deadline no account would accept.
 */
function readMaxDeliverySeconds(
  maxDeliverySeconds: number | undefined,
): number | undefined {
  if (maxDeliverySeconds === undefined) {
    return undefined;
  }

  if (
    !Number.isSafeInteger(maxDeliverySeconds) ||
    maxDeliverySeconds < minimumDeliverySeconds ||
    maxDeliverySeconds > maximumDeliverySeconds
  ) {
    throw new SimSesBadRequestException(
      `1 validation error detected: Value '${String(maxDeliverySeconds)}' at ` +
        `'deliveryOptions.maxDeliverySeconds' failed to satisfy constraint: ` +
        `Member must be between ${String(minimumDeliverySeconds)} and ${String(
          maximumDeliverySeconds,
        )}`,
    );
  }

  return maxDeliverySeconds;
}
