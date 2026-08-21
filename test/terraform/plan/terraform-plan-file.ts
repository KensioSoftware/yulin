import { TemporaryDirectory } from "../../../src/util/filesystem/temporary-directory.js";
import { jsonStringify } from "../../../src/util/type-guard/json.js";
import {
  terraformPlanFactory,
  type TerraformPlanFixture,
} from "./terraform-plan.factory.js";

/**
 * A plan fixture written out as the JSON `terraform show -json` writes.
 *
 * `TerraformAdapter.deployPlan` reads a path rather than a document, so a test
 * of a deployment needs the JSON on disk. It goes to a temporary directory, so
 * a run leaves the repository as it found it.
 */
export async function terraformPlanFile(
  fixture: Partial<TerraformPlanFixture>,
  fileName = "orders.tfplan.json",
): Promise<string> {
  const directory = new TemporaryDirectory();

  await directory.writeFile(
    fileName,
    jsonStringify(terraformPlanFactory.make(fixture)),
  );

  return directory.join(fileName);
}
