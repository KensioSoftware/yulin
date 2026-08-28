/**
 * The throwaway project the packed tarball is installed into, and the checks
 * that run inside it.
 *
 * Everything here works the way a package consumer does: through the installed
 * package's own export subpaths, with no path back into this repository's
 * source tree.
 */

import { execa } from "execa";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { isFile } from "./verify-pack-files.mjs";
import type {
  ImportResult,
  PackageManifest,
  Subpath,
} from "./verify-pack.type.mjs";

const projectRoot = path.resolve(import.meta.dirname, "../..");

/** Consumer file whose only job is to name types the package must export. */
const typeUsageFileName = "use-types.ts";

/**
 * What a consumer writes when it names the types Yulin's own API asks for.
 *
 * This is compiled rather than run, because a type that is missing from the
 * package leaves nothing behind at runtime for the import check to miss.
 */
const typeUsageSource = `import {
  SimAws,
  simAwsAccountId,
  type SimAwsAccountId,
} from "@kensio/yulin";
import type {
  CfnTemplateBodyRecord,
  SimCfnBinding,
  SimCfnCdkOutStackOptions,
  SimCfnCdkOutTemplateTransform,
  SimCfnDeployedResource,
  SimCfnDeployedStack,
} from "@kensio/yulin/cloudformation";

const accountId: SimAwsAccountId = simAwsAccountId("111111111111");

const template: CfnTemplateBodyRecord = {
  Resources: {
    Handle: { Type: "AWS::CloudFormation::WaitConditionHandle" },
  },
};

export function deployStack(): Promise<SimCfnDeployedStack> {
  return new SimAws()
    .account(accountId)
    .cloudFormation()
    .deployTemplate({ stackName: "packed-stack", template });
}

export function stackHandle(
  stack: SimCfnDeployedStack,
): SimCfnDeployedResource | undefined {
  return stack.getResource("Handle");
}

export function stackHandles(
  stack: SimCfnDeployedStack,
): readonly SimCfnDeployedResource[] {
  return stack.resources.filter(
    (resource) => resource.type === "AWS::CloudFormation::WaitConditionHandle",
  );
}

const bindings: readonly SimCfnBinding[] = [
  { logicalId: "Greeter", handler: (): string => "hello" },
  { cdkPath: "Packed/Rewrite", handler: (): string => "rewritten" },
];

export function deployWithBindings(): Promise<SimCfnDeployedStack> {
  return new SimAws()
    .account(accountId)
    .cloudFormation()
    .deployTemplateFile({
      stackName: "packed-stack",
      templatePath: "cdk.out/PackedStack.template.json",
      bindings,
    });
}

export const packedStackOptions: SimCfnCdkOutStackOptions = { bindings };

export const substituteFromDeployed: SimCfnCdkOutTemplateTransform = (
  body: CfnTemplateBodyRecord,
  deployed: ReadonlyMap<string, SimCfnDeployedStack>,
): CfnTemplateBodyRecord => {
  deployed.get("packed-stack")?.output("Handle");

  return body;
};
`;

/**
 * A bare ESM project outside the repository, so module resolution cannot fall
 * back to the repository's own `node_modules` or source tree.
 */
export async function createConsumer(
  consumerDirectory: string,
  tarballPath: string,
  manifest: PackageManifest,
): Promise<void> {
  await mkdir(consumerDirectory, { recursive: true });

  await writeFile(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "yulin-verify-pack", version: "0.0.0", private: true, type: "module" }, undefined, 2)}\n`,
    "utf8",
  );

  // Optional peers are installed so that subpaths depending on them are
  // exercised rather than skipped.
  const peers = Object.keys(manifest.peerDependencies ?? {});

  await execa("npm", ["install", "--silent", tarballPath, ...peers], {
    cwd: consumerDirectory,
  });

  console.log(`Installed tarball into ${consumerDirectory}.`);
}

/** Declaration files an export target points at but the tarball does not have. */
export async function findMissingTypes(
  consumerDirectory: string,
  manifest: PackageManifest,
  subpaths: readonly Subpath[],
): Promise<readonly string[]> {
  const packageDirectory = path.join(
    consumerDirectory,
    "node_modules",
    manifest.name,
  );
  const missing: string[] = [];

  for (const subpath of subpaths) {
    if (!(await isFile(path.join(packageDirectory, subpath.types)))) {
      missing.push(`${subpath.specifier} -> ${subpath.types}`);
    }
  }

  return missing;
}

/** Imports each subpath in a child process running inside the consumer. */
export async function importSubpaths(
  consumerDirectory: string,
  subpaths: readonly Subpath[],
): Promise<readonly ImportResult[]> {
  const runnerPath = path.join(consumerDirectory, "import-subpaths.mjs");

  await writeFile(runnerPath, importRunnerSource(subpaths), "utf8");

  const { stdout } = await execa("node", [runnerPath], {
    cwd: consumerDirectory,
  });

  return JSON.parse(stdout) as readonly ImportResult[];
}

function importRunnerSource(subpaths: readonly Subpath[]): string {
  const imports = subpaths.map((subpath) => ({
    specifier: subpath.specifier,
    requiredExports: subpath.requiredExports,
  }));

  return `const imports = ${JSON.stringify(imports, undefined, 2)};
const results = [];

for (const { specifier, requiredExports } of imports) {
  try {
    const module = await import(specifier);
    const missing = requiredExports.filter((name) => !(name in module));

    results.push({
      specifier,
      ok: missing.length === 0,
      exportCount: Object.keys(module).length,
      error:
        missing.length === 0
          ? undefined
          : \`missing export(s): \${missing.join(", ")}\`,
    });
  } catch (error) {
    results.push({
      specifier,
      ok: false,
      exportCount: 0,
      error: \`\${error.code ?? ""} \${error.message}\`.trim().split("\\n")[0],
    });
  }
}

process.stdout.write(JSON.stringify(results));
`;
}

/**
 * Compiles a consumer file that names the package's types, using this
 * repository's own tsc against the tarball installed in the consumer.
 *
 * Module resolution follows the consumer's `node_modules`, so this fails on a
 * type the package does not export even though the repository's own source
 * tree has it.
 */
export async function assertTypesUsable(
  consumerDirectory: string,
): Promise<void> {
  await writeFile(
    path.join(consumerDirectory, typeUsageFileName),
    typeUsageSource,
    "utf8",
  );

  try {
    await execa(
      path.join(projectRoot, "node_modules", ".bin", "tsc"),
      [
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--module",
        "nodenext",
        "--target",
        "es2023",
        typeUsageFileName,
      ],
      { cwd: consumerDirectory },
    );
  } catch (error) {
    const { stdout } = error as { readonly stdout?: string };

    throw new Error(
      `A consumer cannot name the package's types:\n${stdout ?? String(error)}`,
      { cause: error },
    );
  }

  console.log("Consumer type usage compiles against the tarball.");
}
