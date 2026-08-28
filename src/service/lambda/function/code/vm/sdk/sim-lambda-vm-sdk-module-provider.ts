import { SimLambdaRuntimeError } from "../../../../error/sim-lambda-runtime.error.js";

/**
 * The package scope the real Lambda Node.js runtime provides without
 * bundling: AWS SDK v3 client packages.
 */
export const awsSdkPackagePrefix = "@aws-sdk/";

/**
 * Provides host-backed modules to sim Lambda vm function code.
 *
 * The vm module system asks a provider for bare specifiers the code archive
 * cannot resolve, mirroring how the real Lambda Node.js runtime provides the
 * AWS SDK without it being bundled in the deployment package, and for the
 * Node.js built-ins, which the runtime provides whatever the package contains.
 * A provider returns undefined for specifiers it does not serve, so a built-in
 * falls through to the host's and a bare specifier is reported with the
 * original archive resolution error.
 */
export interface SimLambdaVmSdkModuleProvider {
  provideModule(specifier: string): unknown;

  /**
   * Which of the given specifiers this provider serves and cannot resolve.
   *
   * The module system asks once a package has turned out to be missing. The
   * refusal then names every package the project has to install, where on
   * its own it would name only the one the function code reached first. A
   * provider that does not answer is asked for one specifier at a time.
   */
  unresolvedModules?(specifiers: readonly string[]): readonly string[];
}

/**
 * Module provider used when no simulated AWS environment is wired up, such
 * as for a standalone SimLambda constructed outside SimAws.
 */
export class SimLambdaNoVmSdkModuleProvider implements SimLambdaVmSdkModuleProvider {
  /**
   * Fail AWS SDK requires with an explanation of how to wire the provider.
   */
  provideModule(specifier: string): unknown {
    if (!specifier.startsWith(awsSdkPackagePrefix)) {
      return undefined;
    }

    throw new SimLambdaRuntimeError(
      "Runtime.ImportModuleError",
      `Cannot provide ${specifier} to sim Lambda function code: this ` +
        "SimLambda has no simulated SDK module provider. Create the " +
        "function through SimAws, construct SimLambda with a " +
        "vmSdkModuleProvider, or bundle the package into the function code " +
        "archive.",
    );
  }
}
