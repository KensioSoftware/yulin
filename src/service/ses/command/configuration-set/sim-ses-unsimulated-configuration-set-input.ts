import { SimSesUnsupportedOperationException } from "../../error/sim-ses.error.js";
import type { SimCreateConfigurationSetCommandInput } from "./configuration-set.command.js";

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
