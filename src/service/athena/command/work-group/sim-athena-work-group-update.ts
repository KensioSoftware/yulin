import type { SimAthenaWorkGroup } from "../../workgroup/sim-athena-work-group.js";
import type { SimAthenaWorkGroupStore } from "../../workgroup/sim-athena-work-group-store.js";
import { workGroupStateFrom } from "./sim-athena-work-group-input.js";
import { workGroupConfigurationUpdatesFrom } from "./sim-athena-work-group-updates-input.js";
import type { SimUpdateWorkGroupCommandInput } from "./work-group.command.js";

/**
 * Apply one `UpdateWorkGroup` to a stored workgroup.
 *
 * Athena updates field by field rather than by replacement, so an update
 * leaving a field out keeps what the workgroup already had. The stored
 * workgroup is replaced rather than mutated, so one a caller is already
 * holding cannot change under it.
 */
export function updateWorkGroupIn(
  workGroups: SimAthenaWorkGroupStore,
  name: string,
  input: SimUpdateWorkGroupCommandInput,
): void {
  const workGroup = workGroups.require(name);
  const updates = input.ConfigurationUpdates;

  workGroups.put(
    workGroup.updated({
      description: input.Description,
      state: workGroupStateFrom(input.State),
      configuration: updatedConfiguration(workGroup, updates),
    }),
  );
}

function updatedConfiguration(
  workGroup: SimAthenaWorkGroup,
  updates: SimUpdateWorkGroupCommandInput["ConfigurationUpdates"],
): SimAthenaWorkGroup["configuration"] | undefined {
  if (updates === undefined) {
    return undefined;
  }

  return workGroup.configuration.updatedWith(
    workGroupConfigurationUpdatesFrom(updates),
  );
}
