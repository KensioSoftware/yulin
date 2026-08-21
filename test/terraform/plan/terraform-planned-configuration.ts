import { TestTerraformProject } from "../../../src/util/filesystem/test-terraform-project.js";

/*
 * The two configurations committed under `test/terraform`, planned on demand.
 *
 * A test deploying one needs the plan on disk and a handler for the function
 * the configuration declares, and both are the same wherever the plan is
 * deployed, so they are said once here.
 */

/**
 * The configuration whose `data` blocks cannot be read offline.
 *
 * The community modules read `aws_caller_identity`, so planning that
 * configuration reports those data sources as errors and still plans the
 * managed resources, which are what an import reads.
 */
const toleratedDataSourceFailures = new Set(["modules"]);

/** The function each configuration declares, by configuration name. */
const functionNames: Record<string, string> = {
  app: "orders-processor",
  modules: "orders-processor-independent",
};

/**
 * What the functions of one configuration run.
 *
 * A plan points a function at a zip, an S3 object or a container image, and
 * none of the three is a handler Yulin can run, so a plan holding a function
 * is deployed with a binding matched on the name the plan declares.
 */
export function terraformPlanHandlers(
  name: string,
): readonly { functionName: string; handler: () => { ok: boolean } }[] {
  return [
    {
      // oxlint-disable-next-line security/detect-object-injection
      functionName: functionNames[name] ?? "",
      handler: (): { ok: boolean } => ({ ok: true }),
    },
  ];
}

/**
 * The path of the plan JSON for one committed configuration.
 *
 * Planning takes a second or so and gives the same plan every time, so one
 * test file plans a configuration once however many of its tests deploy it.
 */
const planned = new Map<string, Promise<string>>();

export async function terraformPlannedPath(name: string): Promise<string> {
  const existing = planned.get(name);

  if (existing !== undefined) {
    return await existing;
  }

  const project = new TestTerraformProject(name, {
    toleratesDataSourceErrors: toleratedDataSourceFailures.has(name),
  });
  const path = project.planJsonPath();

  planned.set(name, path);

  return await path;
}
