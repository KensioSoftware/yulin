import { readFile } from "node:fs/promises";
import { jsonParse, type JSONString } from "../../../util/type-guard/json.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";

/** The file a CDK cloud assembly describes itself in. */
export const CDK_ASSEMBLY_MANIFEST_FILE_NAME = "manifest.json";

/** What an environment-agnostic Stack carries in place of a region. */
const CDK_UNKNOWN_REGION = "unknown-region";

interface SimCdkAssemblyArtifact {
  readonly type?: string | undefined;
  readonly environment?: string | undefined;
  readonly dependencies?: readonly string[] | undefined;
  readonly properties?:
    | {
        readonly templateFile?: string | undefined;
        readonly stackName?: string | undefined;
      }
    | undefined;
}

export type SimCdkAssemblyArtifacts = Record<string, SimCdkAssemblyArtifact>;

interface SimCdkAssemblyManifest {
  readonly artifacts?: SimCdkAssemblyArtifacts | undefined;
}

/**
 * Read the artifacts a CDK cloud assembly's `manifest.json` holds.
 *
 * Reading it is what tells a caller that the directory they named is a cloud
 * assembly at all, so the failure names the file rather than the directory.
 */
export async function readCdkAssemblyArtifacts(
  manifestPath: string,
): Promise<SimCdkAssemblyArtifacts> {
  try {
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    const body = await readFile(manifestPath, "utf8");
    const manifest = jsonParse(body as JSONString<SimCdkAssemblyManifest>);

    return manifest.artifacts ?? {};
  } catch (error) {
    throw new Error(
      `Could not read the CDK cloud assembly manifest at ${manifestPath}. A cloud assembly is what \`cdk synth\` writes, and it holds a manifest naming every Stack in it.`,
      { cause: error },
    );
  }
}

/**
 * Read the region out of a CDK environment such as `aws://111111111111/eu-west-2`.
 *
 * An environment-agnostic Stack carries `unknown-region`, and takes its region
 * from whoever deploys it instead.
 */
export function cdkEnvironmentRegionName(
  environment: string | undefined,
): AwsRegionName | undefined {
  const regionName = environment?.split("/").at(-1);

  return regionName === CDK_UNKNOWN_REGION
    ? undefined
    : (regionName as AwsRegionName | undefined);
}
