import {
  SimIamEntityLookup,
  type SimIamEntityLookupProperties,
} from "./sim-iam-entity-lookup.js";
import { SimIamInlinePolicyCommands } from "./sim-iam-inline-policy-commands.js";
import { SimIamManagedPolicyCommands } from "./sim-iam-managed-policy-commands.js";

/**
 * The inline and managed policy commands IAM serves alike for one kind of
 * Role, User or group.
 *
 * Each command is authorized as the IAM action of the same name, on the
 * entity's ARN.
 */
export class SimIamEntityPolicyCommands {
  readonly inline: SimIamInlinePolicyCommands;
  readonly managed: SimIamManagedPolicyCommands;

  constructor(properties: SimIamEntityLookupProperties) {
    const lookup = new SimIamEntityLookup(properties);

    this.inline = new SimIamInlinePolicyCommands(lookup);
    this.managed = new SimIamManagedPolicyCommands(lookup);
  }
}
