import path from "node:path";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import {
  CDK_ASSEMBLY_MANIFEST_FILE_NAME,
  cdkEnvironmentRegionName,
  readCdkAssemblyArtifacts,
} from "./sim-cdk-assembly-manifest-file.js";

const CDK_STACK_ARTIFACT_TYPE = "aws:cloudformation:stack";

/**
 * One CloudFormation Stack artifact in a CDK cloud assembly.
 */
export interface SimCdkAssemblyStack {
  /** The key the artifact is held under, which other artifacts depend on. */
  readonly artifactId: string;

  /** The name the Stack is deployed as. */
  readonly stackName: string;

  /** The absolute path to the synthesized template file. */
  readonly templatePath: string;

  /**
   * The region the Stack's environment names, absent when it names none.
   */
  readonly regionName?: AwsRegionName | undefined;

  /** The artifacts this one comes after, Stacks and assets alike. */
  readonly dependencyArtifactIds: readonly string[];
}

/**
 * Read the Stack artifacts a CDK cloud assembly holds.
 *
 * The manifest is the only file that knows about the set. Each Stack artifact
 * carries the template file to deploy, the environment naming its region, and
 * the artifacts it comes after.
 */
export async function loadCdkAssemblyStacks(
  directoryPath: string,
): Promise<readonly SimCdkAssemblyStack[]> {
  const assemblyPath = path.resolve(directoryPath);
  const artifacts = await readCdkAssemblyArtifacts(
    path.join(assemblyPath, CDK_ASSEMBLY_MANIFEST_FILE_NAME),
  );

  return Object.entries(artifacts)
    .filter(([, artifact]) => artifact.type === CDK_STACK_ARTIFACT_TYPE)
    .map(([artifactId, artifact]) => ({
      artifactId,
      stackName: artifact.properties?.stackName ?? artifactId,
      templatePath: path.join(
        assemblyPath,
        artifact.properties?.templateFile ?? `${artifactId}.template.json`,
      ),
      regionName: cdkEnvironmentRegionName(artifact.environment),
      dependencyArtifactIds: artifact.dependencies ?? [],
    }));
}
