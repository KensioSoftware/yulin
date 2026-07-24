import { createRequire } from "node:module";
import path from "node:path";
import { SimSdkModuleClientInterceptor } from "../../../../../../sdk/module/sim-sdk-module-client-interceptor.js";
import { SimSdkCommandDispatcher } from "../../../../../../sdk/sim-sdk-command-dispatcher.js";
import type { AwsRegionName } from "../../../../../aws/sim-aws-region.js";
import type { SimAws } from "../../../../../aws/sim-aws.js";
import {
  awsSdkPackagePrefix,
  type SimLambdaVmSdkModuleProvider,
} from "./sim-lambda-vm-sdk-module-provider.js";

const hostRequire = createRequire(import.meta.url);

interface SimSdkLambdaVmModuleProviderProperties {
  readonly simAws: SimAws;
  readonly regionName?: AwsRegionName | undefined;
  /**
   * Host module require, injectable for tests. Defaults to requiring from
   * this package's context with a working-directory fallback for consumer
   * package layouts that do not hoist dependencies.
   */
  readonly requireModule?: ((specifier: string) => unknown) | undefined;
}

/**
 * Provides host-installed AWS SDK v3 packages to sim Lambda vm function
 * code, with client classes intercepted into the owning simulated AWS
 * environment.
 *
 * Calls made by the function code are routed per send, so the ambient
 * execution-role caller applies and simulated IAM authorizes them, just as
 * the real Lambda runtime's bundled SDK operates as the execution role.
 */
export class SimSdkLambdaVmModuleProvider implements SimLambdaVmSdkModuleProvider {
  private readonly interceptor: SimSdkModuleClientInterceptor;
  private readonly requireModule: (specifier: string) => unknown;
  private readonly providedModules = new Map<string, unknown>();

  constructor(properties: SimSdkLambdaVmModuleProviderProperties) {
    const dispatcher = new SimSdkCommandDispatcher(properties.simAws);
    this.interceptor = new SimSdkModuleClientInterceptor({
      sendHandler: (command, client): Promise<unknown> =>
        dispatcher.dispatch(command, client, undefined),
      defaultRegionName: properties.regionName,
    });
    this.requireModule = properties.requireModule ?? requireHostModule;
  }

  /**
   * Provide an intercepted AWS SDK package module, or undefined for other
   * specifiers.
   */
  provideModule(specifier: string): unknown {
    if (!specifier.startsWith(awsSdkPackagePrefix)) {
      return undefined;
    }

    const provided = this.providedModules.get(specifier);
    if (provided !== undefined) {
      return provided;
    }

    const intercepted = this.interceptor.interceptModule(
      this.hostModuleExports(specifier),
    );
    this.providedModules.set(specifier, intercepted);
    return intercepted;
  }

  private hostModuleExports(specifier: string): object {
    let moduleExports: unknown;
    try {
      moduleExports = this.requireModule(specifier);
    } catch (error) {
      // Only translate resolution failures: an installed package failing to
      // initialize is a real error the function code should observe as-is.
      if (!isModuleNotFoundError(error)) {
        throw error;
      }
      throw new Error(
        `Cannot provide ${specifier} to sim Lambda function code: the ` +
          "package is not installed. Install it in your project, as the " +
          "real Lambda runtime provides it, or bundle it into the function " +
          "code archive.",
        { cause: error },
      );
    }

    if (typeof moduleExports !== "object" || moduleExports === null) {
      throw new Error(
        `Cannot provide ${specifier} to sim Lambda function code: the host ` +
          "module did not export a module object",
      );
    }
    return moduleExports;
  }
}

/**
 * Require an AWS SDK package from the host.
 *
 * The packages are installed by the consuming project, as they are provided
 * by the real Lambda runtime rather than by this package. Requiring from
 * this module's context covers hoisted installs; the working-directory
 * fallback covers stricter package layouts.
 */
function requireHostModule(specifier: string): unknown {
  try {
    return hostRequire(specifier);
  } catch {
    /* v8 ignore next 4 -- only reachable in consumer package layouts where
       this package's own require context cannot see the SDK packages. */
    return createRequire(path.join(process.cwd(), "package.json"))(specifier);
  }
}

/**
 * Whether an error is a Node.js module resolution failure, as opposed to an
 * error thrown while a resolved module initializes.
 */
function isModuleNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "MODULE_NOT_FOUND" || error.code === "ERR_MODULE_NOT_FOUND")
  );
}
