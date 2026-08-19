import { AsyncMappedFactory } from "@kensio/part-factory";
import { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import { jsonStringify } from "../../../util/type-guard/json.js";
import type { SimCfnTemplateValueRecord } from "../template/value/sim-cfn-template-value.js";

/**
 * One synthesized Stack in a cloud assembly a test writes.
 */
export interface SimCdkCloudAssemblyStackInput {
  /** The key the manifest holds the artifact under. */
  readonly artifactId: string;

  /** The name the Stack deploys as, which defaults to the artifact ID. */
  readonly stackName?: string | undefined;

  /**
   * The region the Stack's environment names.
   *
   * Left out, the Stack is environment-agnostic, the way `cdk synth` writes a
   * Stack given no `env`.
   */
  readonly regionName?: string | undefined;

  /** The artifact IDs the manifest says this Stack comes after. */
  readonly dependencies?: readonly string[] | undefined;

  /**
   * The template's Resources, which default to one Bucket named after the
   * artifact, so a test can find the Stack's work in the region it landed in.
   */
  readonly resources?: SimCfnTemplateValueRecord | undefined;

  /** The template's Outputs, which a Stack sharing a value needs. */
  readonly outputs?: SimCfnTemplateValueRecord | undefined;
}

export interface SimCdkCloudAssemblyInput {
  readonly stacks: readonly SimCdkCloudAssemblyStackInput[];
}

/** The Bucket a Stack in a written assembly creates, unless it is given others. */
export function assemblyStackBucketName(artifactId: string): string {
  return `${artifactId.toLowerCase()}-bucket`;
}

/**
 * Writes a synthesized CDK cloud assembly to a temporary directory.
 *
 * What comes back is the directory holding it, so the assembly itself is at
 * `directory.join("cdk.out")`.
 *
 * ```typescript
 * const directory = await simCdkCloudAssemblyFactory.make({
 *   stacks: [
 *     { artifactId: "SiteStack", regionName: "eu-west-2" },
 *     { artifactId: "DnsStack", regionName: "us-east-1" },
 *   ],
 * });
 * ```
 */
export const simCdkCloudAssemblyFactory = new AsyncMappedFactory<
  SimCdkCloudAssemblyInput,
  TemporaryDirectory
>(
  () => ({ stacks: [{ artifactId: "SiteStack", regionName: "eu-west-2" }] }),
  async (input) => {
    const directory = new TemporaryDirectory();

    await directory.writeFile(
      ["cdk.out", "manifest.json"],
      jsonStringify(assemblyManifest(input.stacks)),
    );

    await Promise.all(
      input.stacks.map(async (stack) =>
        directory.writeFile(
          ["cdk.out", templateFileName(stack)],
          // JSON.stringify drops an undefined value, so a Stack given no
          // Outputs writes a template with none rather than a null one.
          jsonStringify({
            Resources: stackResources(stack),
            Outputs: stack.outputs,
          }),
        ),
      ),
    );

    return directory;
  },
);

function assemblyManifest(
  stacks: readonly SimCdkCloudAssemblyStackInput[],
): object {
  return {
    version: "54.0.0",
    artifacts: Object.fromEntries(
      stacks.map((stack) => [
        stack.artifactId,
        {
          type: "aws:cloudformation:stack",
          environment: `aws://111111111111/${stack.regionName ?? "unknown-region"}`,
          displayName: stack.artifactId,
          dependencies: [
            ...(stack.dependencies ?? []),
            `${stack.artifactId}.assets`,
          ],
          properties: {
            templateFile: templateFileName(stack),
            stackName: stack.stackName,
          },
        },
      ]),
    ),
  };
}

function templateFileName(stack: SimCdkCloudAssemblyStackInput): string {
  return `${stack.artifactId}.template.json`;
}

function stackResources(
  stack: SimCdkCloudAssemblyStackInput,
): SimCfnTemplateValueRecord {
  return (
    stack.resources ?? {
      [`${stack.artifactId}Bucket`]: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: assemblyStackBucketName(stack.artifactId),
        },
      },
    }
  );
}
