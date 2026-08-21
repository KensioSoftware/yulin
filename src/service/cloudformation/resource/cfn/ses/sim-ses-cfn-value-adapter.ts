import { SimSesConfigurationSet } from "../../../../ses/configuration-set/sim-ses-configuration-set.js";
import { SimSesIdentity } from "../../../../ses/identity/sim-ses-identity.js";
import { SimSesTemplate } from "../../../../ses/template/sim-ses-template.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimSesConfigurationSetCfn } from "./sim-ses-configuration-set-cfn.js";
import { SimSesIdentityCfn } from "./sim-ses-identity-cfn.js";
import { SimSesTemplateCfn } from "./sim-ses-template-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated SES Resource.
 */
export function sesValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::SES::EmailIdentity" &&
    properties.simResource instanceof SimSesIdentity
  ) {
    return new SimSesIdentityCfn({ identity: properties.simResource });
  }

  if (
    properties.type === "AWS::SES::Template" &&
    properties.simResource instanceof SimSesTemplate
  ) {
    return new SimSesTemplateCfn({ template: properties.simResource });
  }

  if (
    properties.type === "AWS::SES::ConfigurationSet" &&
    properties.simResource instanceof SimSesConfigurationSet
  ) {
    return new SimSesConfigurationSetCfn({
      configurationSet: properties.simResource,
    });
  }

  return undefined;
}
