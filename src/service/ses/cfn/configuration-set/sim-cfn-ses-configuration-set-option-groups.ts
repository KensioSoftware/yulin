import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateConfigurationSetCommandInput } from "../../command/configuration-set/configuration-set.command.js";
import {
  sesCfnBoolean,
  sesCfnNumber,
  sesCfnString,
  sesCfnStringList,
  type SimCfnSesPropertyFailure,
} from "../sim-cfn-ses-property-scalars.js";

/** Everything an AWS::SES::ConfigurationSet says apart from its name. */
type SimCfnSesConfigurationSetOptions = Omit<
  SimCreateConfigurationSetCommandInput,
  "ConfigurationSetName" | "TrackingOptions" | "VdmOptions" | "Tags"
>;

/**
 * Read the option groups of an AWS::SES::ConfigurationSet Resource.
 *
 * A group the template leaves out stays out, so `CreateConfigurationSet`
 * applies the default real SES would rather than one made up here.
 *
 * Members are read one at a time so their types are settled before the command
 * sees them. Handing a group over whole would store a `"false"` that reached
 * the template through a String Parameter as the string it arrived as, which
 * reads back as configured and means the opposite of what it says.
 *
 * The enums are left to the command. `TlsPolicy` and the suppression reasons
 * are checked in one place, so a template and an SDK caller hear the same
 * answer.
 */
export function readCfnSesConfigurationSetOptions(
  properties: ReadonlyMap<string, SimCfnTemplateValue>,
  fail: SimCfnSesPropertyFailure,
): SimCfnSesConfigurationSetOptions {
  const suppression = group(properties, "SuppressionOptions", fail);
  const sending = group(properties, "SendingOptions", fail);
  const delivery = group(properties, "DeliveryOptions", fail);
  const reputation = group(properties, "ReputationOptions", fail);

  return {
    SuppressionOptions: suppression && {
      SuppressedReasons: sesCfnStringList(
        suppression["SuppressedReasons"],
        "SuppressionOptions.SuppressedReasons",
        fail,
      ),
    },
    SendingOptions: sending && {
      SendingEnabled: sesCfnBoolean(
        sending["SendingEnabled"],
        "SendingOptions.SendingEnabled",
        fail,
      ),
    },
    DeliveryOptions: delivery && {
      TlsPolicy: sesCfnString(
        delivery["TlsPolicy"],
        "DeliveryOptions.TlsPolicy",
        fail,
      ),
      SendingPoolName: sesCfnString(
        delivery["SendingPoolName"],
        "DeliveryOptions.SendingPoolName",
        fail,
      ),
      MaxDeliverySeconds: sesCfnNumber(
        delivery["MaxDeliverySeconds"],
        "DeliveryOptions.MaxDeliverySeconds",
        fail,
      ),
    },
    ReputationOptions: reputation && {
      ReputationMetricsEnabled: sesCfnBoolean(
        reputation["ReputationMetricsEnabled"],
        "ReputationOptions.ReputationMetricsEnabled",
        fail,
      ),
    },
  };
}

/**
 * One option group, or nothing where the template leaves it out.
 */
function group(
  properties: ReadonlyMap<string, SimCfnTemplateValue>,
  name: string,
  fail: SimCfnSesPropertyFailure,
): SimCfnTemplateValueRecord | undefined {
  const value = properties.get(name);

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw fail(`${name} must be an object`);
  }

  return value;
}
