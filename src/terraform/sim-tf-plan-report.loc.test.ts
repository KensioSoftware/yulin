import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertArrayMinLength,
  assertIdentical,
} from "@kensio/smartass";
import { SimAws } from "../service/aws/sim-aws.js";
import {
  terraformPlanHandlers as handlersFor,
  terraformPlannedPath as plannedPath,
} from "../../test/terraform/plan/terraform-planned-configuration.js";
import { TerraformAdapter } from "./sim-tf-adapter.js";
import type { TerraformImportReport } from "./sim-tf-report.type.js";

/*
 * What an import makes of the two configurations committed under
 * `test/terraform`.
 *
 * The resources a plan does not reach are asserted rather than reported, so a
 * mapping that stops reaching a resource type shows up as a failure here
 * rather than as a number nobody reads.
 */

/**
 * What each configuration leaves unreached, by configuration name.
 *
 * Both are at their ceiling. The application configuration leaves nothing, and
 * the modules configuration packages its zip with `null_resource` and
 * `local_file`, which belong to no AWS service and no import can reach.
 */
const unreachedTypes: Record<string, readonly string[]> = {
  app: [],
  modules: ["local_file", "null_resource"],
};

/** The report each committed configuration's plan deploys to. */
async function reports(): Promise<Record<string, TerraformImportReport>> {
  const adapter = new TerraformAdapter(new SimAws());
  const deployed = await Promise.all(
    Object.keys(unreachedTypes).map(async (name) => {
      const { report } = await adapter.deployPlan({
        planPath: await plannedPath(name),
        stackName: `reported-${name}`,
        bindings: handlersFor(name),
      });

      return [name, report] as const;
    }),
  );

  return Object.fromEntries(deployed);
}

/** Type name order by code unit, so a machine's locale cannot move it. */
function byName(one: string, other: string): number {
  return one < other ? -1 : 1;
}

describe("reading what a plan holds", () => {
  it("accounts for every managed resource of a plan", async () => {
    // Given both plans deployed
    const deployed = await reports();

    // When each resource is mapped, folded into another, or skipped
    // Then the three add up to the plan's managed resource count
    for (const report of Object.values(deployed)) {
      assertIdentical(
        report.mapped.length + report.folded.length + report.skipped.length,
        report.total,
      );
      assertArrayMinLength(report.mapped, 10);
    }
  });

  it("reaches every resource of a plan that a mapping can reach", async () => {
    // Given both plans deployed
    const deployed = await reports();

    // When each resource is mapped, folded or skipped
    // Then what was skipped is what has nowhere to go
    for (const [name, expected] of Object.entries(unreachedTypes)) {
      assertArrayEquals(
        // oxlint-disable-next-line security/detect-object-injection
        (deployed[name]?.skipped ?? [])
          .map((entry) => entry.type)
          .toSorted(byName),
        expected,
      );
    }
  });
});
