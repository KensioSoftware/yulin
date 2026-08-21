import { readFile } from "node:fs/promises";
import path from "node:path";
import { isRecord } from "../util/type-guard/record.js";
import type { TerraformPlan } from "./sim-tf-plan.type.js";

/**
 * Read the plan JSON at a path.
 *
 * The two ways of getting this wrong are worth telling apart. A path with no
 * file at it is named as resolved, and a file that is not the JSON form is met
 * with the command that writes it, since `terraform plan -out` writes a binary
 * file whose name looks like the right one.
 *
 * A document that parses but is not a plan is refused the same way. Every
 * `terraform show -json` document carries `format_version`, and without that
 * check a JSON file of anything at all reads as a plan that creates nothing
 * and deploys as an empty Stack.
 */
export async function readTerraformPlanFile(
  planPath: string,
): Promise<TerraformPlan> {
  const contents = await planFileContents(planPath);

  try {
    const parsed: unknown = JSON.parse(contents);

    if (isPlanDocument(parsed)) {
      return parsed;
    }
  } catch (error) {
    throw notPlanJson(planPath, error);
  }

  throw notPlanJson(planPath);
}

/**
 * The Stack name a plan file gives, for a deployment that names none.
 *
 * `orders.tfplan.json` deploys as `orders`, the way a template file deployment
 * is named after the template.
 */
export function terraformStackNameFromPlanPath(planPath: string): string {
  return path.basename(planPath).replace(/(?:\.tfplan|\.plan)?\.json$/u, "");
}

function isPlanDocument(parsed: unknown): parsed is TerraformPlan {
  return isRecord(parsed) && typeof parsed["format_version"] === "string";
}

async function planFileContents(planPath: string): Promise<string> {
  try {
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    return await readFile(planPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `No Terraform plan JSON file at ${path.resolve(planPath)}`,
        { cause: error },
      );
    }

    throw error;
  }
}

function notPlanJson(planPath: string, cause?: unknown): Error {
  return new Error(
    `${path.resolve(planPath)} is not Terraform plan JSON. ` +
      `Write it with \`terraform show -json <planfile>\`.`,
    { cause },
  );
}
