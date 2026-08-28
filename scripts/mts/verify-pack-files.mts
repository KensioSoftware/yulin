/**
 * The checks for what the package publishes as files rather than as modules.
 *
 * An export naming a JSON file is not something the import check can reach,
 * and the Oxlint config fragment is named by path from a consumer's own config
 * rather than imported at all. The documentation is read by a person or a
 * coding agent and never resolved by anything. All three are checked against
 * the installed tarball.
 */

import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import type { FileExport, PackageManifest } from "./verify-pack.type.mjs";

/** The Oxlint config fragment, as it sits in the published package root. */
const oxlintConfigFileName = "cffjs2.oxlintrc.json";

/** The documentation index, as it sits in the published package root. */
const documentationIndexFileName = "llms.txt";

/**
 * Resolves every string-valued export the way a consumer would.
 *
 * These are files rather than modules, so the import check cannot reach them,
 * and a target that no longer exists in the tarball shows up nowhere else.
 */
export function assertFileExportsResolve(
  consumerDirectory: string,
  fileExports: readonly FileExport[],
): void {
  const consumerRequire = createRequire(
    path.join(consumerDirectory, "resolve-file-exports.cjs"),
  );

  const unresolvable = fileExports.filter((fileExport) => {
    try {
      consumerRequire.resolve(fileExport.specifier);

      return false;
    } catch {
      return true;
    }
  });

  if (unresolvable.length > 0) {
    throw new Error(
      `Export subpaths naming a file the tarball does not have:\n${unresolvable
        .map(
          (fileExport) => `  ${fileExport.specifier} -> ${fileExport.target}`,
        )
        .join("\n")}`,
    );
  }

  console.log(
    `All ${String(fileExports.length)} file export subpaths resolve from the tarball.`,
  );
}

/**
 * Checks the Oxlint config at the path a consumer writes into `extends`.
 *
 * Oxlint has no package-name resolution there, so a consumer names this file
 * through `node_modules` and Oxlint resolves the plugin inside it against that
 * same location. Both halves are checked in the tarball, because a consumer
 * running Oxlint is the only other place either would be noticed.
 */
export async function assertOxlintConfigExtendable(
  consumerDirectory: string,
  manifest: PackageManifest,
): Promise<void> {
  const configPath = path.join(
    consumerDirectory,
    "node_modules",
    manifest.name,
    oxlintConfigFileName,
  );

  if (!(await isFile(configPath))) {
    throw new Error(
      `The tarball has no ${oxlintConfigFileName} in its package root, so a consumer's Oxlint \`extends\` has nothing to name.`,
    );
  }

  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    readonly jsPlugins: readonly { readonly specifier: string }[];
  };

  for (const plugin of config.jsPlugins) {
    if (
      !(await isFile(path.resolve(path.dirname(configPath), plugin.specifier)))
    ) {
      throw new Error(
        `${oxlintConfigFileName} names a plugin at ${plugin.specifier}, which is not in the tarball.`,
      );
    }
  }

  console.log(
    "Oxlint config sits in the package root and finds its own plugin.",
  );
}

/**
 * Checks the documentation the package ships against its own index.
 *
 * The pages reach the tarball through a glob in `files`, and a glob that stops
 * matching publishes a package whose index points at nothing. Every entry in
 * `llms.txt` is looked up in the installed package, which covers the index and
 * the pages together.
 */
export async function assertDocumentationPublished(
  consumerDirectory: string,
  manifest: PackageManifest,
): Promise<void> {
  const packageRoot = path.join(
    consumerDirectory,
    "node_modules",
    manifest.name,
  );
  const indexPath = path.join(packageRoot, documentationIndexFileName);

  if (!(await isFile(indexPath))) {
    throw new Error(
      `The tarball has no ${documentationIndexFileName} in its package root, so the documentation it ships has no index.`,
    );
  }

  const index = await readFile(indexPath, "utf8");
  const pages = index
    .matchAll(/^- \[[^\]]+]\(([^\s)]+)\)/gm)
    .map(([, page]) => page ?? "")
    .toArray();

  if (pages.length === 0) {
    throw new Error(
      `${documentationIndexFileName} lists no pages, so the tarball ships an index of nothing.`,
    );
  }

  const missing: string[] = [];

  for (const page of pages) {
    if (!(await isFile(path.join(packageRoot, page)))) {
      missing.push(page);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `${documentationIndexFileName} names pages the tarball does not have:\n${missing.map((page) => `  ${page}`).join("\n")}`,
    );
  }

  console.log(
    `All ${String(pages.length)} documentation pages named by ${documentationIndexFileName} are in the tarball.`,
  );
}

/** Whether a path exists and is a file, rather than a directory or absent. */
export async function isFile(filePath: string): Promise<boolean> {
  try {
    const entry = await stat(filePath);

    return entry.isFile();
  } catch {
    return false;
  }
}
