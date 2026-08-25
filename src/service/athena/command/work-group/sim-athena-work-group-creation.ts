import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimAthenaInvalidRequestException } from "../../error/sim-athena.error.js";
import { SimAthenaWorkGroup } from "../../workgroup/sim-athena-work-group.js";
import type { SimAthenaWorkGroupStore } from "../../workgroup/sim-athena-work-group-store.js";
import { workGroupConfigurationFrom } from "./sim-athena-work-group-input.js";
import type { SimCreateWorkGroupCommandInput } from "./work-group.command.js";

/**
 * Create one workgroup in a store.
 *
 * Creating one whose name is taken is refused rather than replacing it, which
 * is how real Athena answers. Replacing would lose the settings on the
 * existing workgroup without saying so.
 */
export function createWorkGroupIn(
  workGroups: SimAthenaWorkGroupStore,
  clock: SimClock,
  name: string,
  input: SimCreateWorkGroupCommandInput,
): void {
  if (workGroups.find(name) !== undefined) {
    throw new SimAthenaInvalidRequestException(
      `WorkGroup ${name} is already created.`,
    );
  }

  workGroups.put(
    new SimAthenaWorkGroup({
      name,
      createdAt: clock.now(),
      description: input.Description,
      configuration: workGroupConfigurationFrom(input.Configuration),
    }),
  );
}
