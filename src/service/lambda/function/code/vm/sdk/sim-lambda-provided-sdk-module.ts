import { assertDefined } from "../../../../../../util/type-guard/defined.js";
import type { SimZipArchive } from "../../../../../../util/zip/zip-archive.js";
import { SimLambdaVmModuleResolver } from "../sim-lambda-vm-module-resolver.js";
import { SimLambdaSdkPackagesNotInstalledError } from "./sim-lambda-sdk-packages-not-installed.error.js";
import type { SimLambdaVmSdkModuleProvider } from "./sim-lambda-vm-sdk-module-provider.js";

/**
 * The archive entries worth reading specifiers out of.
 */
const javaScriptFilePattern = /\.[cm]?js$/;

/**
 * A quoted `@aws-sdk/*` specifier, however a file asks for it. A `require`
 * call, a dynamic `import`, and a static import's `from` clause all match.
 */
const awsSdkImportPattern =
  /(?:\b(?:require|import)\s*\(|\b(?:from|import)\b)\s*["'](@aws-sdk\/[^"']+)["']/g;

/**
 * What the archive holds and who provides for what it does not. Between them
 * that is enough to tell an absent package from one already accounted for.
 */
interface SimLambdaMissingSdkPackagesContext {
  readonly archive: SimZipArchive;
  readonly sdkModuleProvider: SimLambdaVmSdkModuleProvider;
}

/**
 * The module the runtime provides for a specifier the archive does not
 * bundle, or undefined for a specifier the provider does not serve.
 *
 * A package the project has not installed is refused here naming every other
 * AWS SDK package the function code imports and the project is missing too.
 */
export function provideSdkModule(
  specifier: string,
  context: SimLambdaMissingSdkPackagesContext,
): unknown {
  try {
    return context.sdkModuleProvider.provideModule(specifier);
  } catch (error) {
    throw everyMissingSdkPackage(error, context);
  }
}

/**
 * The refusal to raise for a package the project has not installed, naming
 * every other AWS SDK package the function code imports and the project is
 * missing too. Any other error stands as it is.
 *
 * The runtime provides a package when the code requires it, so on its own a
 * refusal only ever names the one the code reached. A function importing two
 * absent packages would then cost two runs and two installs, and the archive
 * is the only place to read what a third-party function imports. So the
 * archive is read here, once a package has already turned out to be missing,
 * and one install covers the set. An archive that runs is never read.
 */
function everyMissingSdkPackage(
  error: unknown,
  context: SimLambdaMissingSdkPackagesContext,
): unknown {
  if (!(error instanceof SimLambdaSdkPackagesNotInstalledError)) {
    return error;
  }

  const resolver = new SimLambdaVmModuleResolver(context.archive);
  const candidates = archiveAwsSdkImports(context.archive).filter(
    (specifier) =>
      !error.specifiers.includes(specifier) &&
      !resolver.bundlesPackage(specifier),
  );
  const missing =
    context.sdkModuleProvider.unresolvedModules?.(candidates) ?? [];
  if (missing.length === 0) {
    return error;
  }
  return new SimLambdaSdkPackagesNotInstalledError(
    [...error.specifiers, ...missing],
    { cause: error.cause },
  );
}

/**
 * The AWS SDK packages a function code archive's own files import, in the
 * order they appear.
 *
 * Bundled dependencies are left out. What a package under `node_modules/`
 * imports is that package's own business, resolved from the bundle beside it,
 * and reading a vendored tree to name one more install is a poor trade.
 */
function archiveAwsSdkImports(archive: SimZipArchive): readonly string[] {
  const specifiers = new Set<string>();
  for (const filePath of archive.filePaths()) {
    if (!isFunctionCodeFile(filePath)) {
      continue;
    }
    const source = archive.file(filePath).toString();
    for (const match of source.matchAll(awsSdkImportPattern)) {
      const specifier = match[1];
      assertDefined(specifier, "Matched import has no specifier");
      specifiers.add(specifier);
    }
  }
  return specifiers.values().toArray();
}

function isFunctionCodeFile(filePath: string): boolean {
  return (
    javaScriptFilePattern.test(filePath) && !filePath.includes("node_modules/")
  );
}
