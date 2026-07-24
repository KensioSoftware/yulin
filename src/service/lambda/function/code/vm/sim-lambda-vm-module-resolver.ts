import path from "node:path";
import type { SimZipArchive } from "../../../../../util/zip/zip-archive.js";
import { SimLambdaRuntimeError } from "../../../error/sim-lambda-runtime.error.js";

/**
 * Resolves CommonJS require specifiers to file paths within a sim Lambda
 * function code zip archive.
 *
 * Supports relative requires between the archived modules and a minimal
 * node_modules lookup for dependencies bundled into the archive, as SAM-style
 * packaging produces. ES modules are not supported yet.
 */
export class SimLambdaVmModuleResolver {
  constructor(private readonly archive: SimZipArchive) {}

  /**
   * Resolve a require specifier to an archive file path.
   */
  resolveFilePath(specifier: string, fromDirectory: string): string {
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      return this.resolveCandidates(
        path.posix.normalize(path.posix.join(fromDirectory, specifier)),
        specifier,
      );
    }
    return this.resolvePackage(specifier);
  }

  private resolveCandidates(basePath: string, specifier: string): string {
    const candidates = [
      basePath,
      `${basePath}.js`,
      `${basePath}.cjs`,
      `${basePath}.json`,
      `${basePath}/index.js`,
    ];
    for (const candidate of candidates) {
      if (this.archive.hasFile(candidate)) {
        return candidate;
      }
    }

    if (this.archive.hasFile(`${basePath}.mjs`)) {
      throw new SimLambdaRuntimeError(
        "Runtime.ImportModuleError",
        `${basePath}.mjs is an ES module; sim Lambda only supports ` +
          "CommonJS function code so far",
      );
    }
    throw new SimLambdaRuntimeError(
      "Runtime.ImportModuleError",
      `Cannot find module '${specifier}' in the function code archive; ` +
        `archive contains: ${this.archive.filePaths().join(", ")}`,
    );
  }

  /**
   * Resolve a bare specifier against node_modules bundled in the archive.
   */
  private resolvePackage(specifier: string): string {
    const basePath = `node_modules/${specifier}`;
    const packageJsonPath = `${basePath}/package.json`;
    if (this.archive.hasFile(packageJsonPath)) {
      const mainPath = path.posix.normalize(
        path.posix.join(basePath, this.packageMain(packageJsonPath)),
      );
      return this.resolveCandidates(mainPath, specifier);
    }
    return this.resolveCandidates(basePath, specifier);
  }

  private packageMain(packageJsonPath: string): string {
    const packageJson = JSON.parse(
      this.archive.file(packageJsonPath).toString(),
    ) as { main?: string };
    return packageJson.main ?? "index.js";
  }
}
