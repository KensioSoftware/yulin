import { SimSdkModuleClientInterceptor } from "../../../../../../sdk/module/sim-sdk-module-client-interceptor.js";
import { SimSdkCommandDispatcher } from "../../../../../../sdk/sim-sdk-command-dispatcher.js";
import type { AwsRegionName } from "../../../../../aws/sim-aws-region.js";
import type { SimAws } from "../../../../../aws/sim-aws.js";
import { SimLambdaAwsApiOutbound } from "../../../outbound/sim-lambda-aws-api-outbound.js";
import {
  isSimLambdaHttpModuleSpecifier,
  makeSimLambdaHttpModule,
  simLambdaHttpModuleScheme,
} from "../../../outbound/sim-lambda-http-module.js";
import type { SimLambdaOutboundHttp } from "../../../outbound/sim-lambda-outbound-http.js";
import {
  isModuleNotFoundError,
  requireHostModule,
} from "../sim-lambda-host-modules.js";
import { SimLambdaSdkPackagesNotInstalledError } from "./sim-lambda-sdk-packages-not-installed.error.js";
import {
  awsSdkPackagePrefix,
  type SimLambdaVmSdkModuleProvider,
} from "./sim-lambda-vm-sdk-module-provider.js";

interface SimSdkLambdaVmModuleProviderProperties {
  readonly simAws: SimAws;
  readonly regionName?: AwsRegionName | undefined;
  /**
   * Host module require, injectable for tests. Defaults to requiring from
   * this package's context with a working-directory fallback for consumer
   * package layouts that do not hoist dependencies.
   */
  readonly requireModule?: ((specifier: string) => unknown) | undefined;
  /**
   * Where a request the transport modules carry is answered. The AWS service
   * API endpoints alone by default, which is what this provider can reach on
   * its own; a provider built beside a whole simulated environment is given
   * one that answers for everything that environment serves.
   */
  readonly outboundHttp?: SimLambdaOutboundHttp | undefined;
}

/**
 * Provides host-installed AWS SDK v3 packages to sim Lambda vm function
 * code, with client classes intercepted into the owning simulated AWS
 * environment.
 *
 * Calls made by the function code are routed per send, so the ambient
 * execution-role caller applies and simulated IAM authorizes them, just as
 * the real Lambda runtime's bundled SDK operates as the execution role.
 *
 * A deployment package that bundles the SDK asks for no SDK module at all, so
 * there is nothing there to intercept. Such a package still gets its HTTP
 * transport from the runtime, and the modules provided for it answer requests
 * the simulation serves from the same simulation, by the same routing. Which
 * of the two paths a function takes is then only a question of how it was
 * packaged, rather than of whether it works.
 */
export class SimSdkLambdaVmModuleProvider implements SimLambdaVmSdkModuleProvider {
  private readonly interceptor: SimSdkModuleClientInterceptor;
  private readonly outboundHttp: SimLambdaOutboundHttp;
  private readonly requireModule: (specifier: string) => unknown;
  private readonly providedModules = new Map<string, unknown>();

  constructor(properties: SimSdkLambdaVmModuleProviderProperties) {
    const dispatcher = new SimSdkCommandDispatcher(properties.simAws);
    this.interceptor = new SimSdkModuleClientInterceptor({
      sendHandler: (command, client): Promise<unknown> =>
        dispatcher.dispatch(command, client, undefined),
      defaultRegionName: properties.regionName,
    });
    this.outboundHttp =
      properties.outboundHttp ?? new SimLambdaAwsApiOutbound(properties);
    this.requireModule = properties.requireModule ?? requireHostModule;
  }

  /**
   * Provide an intercepted AWS SDK package or HTTP transport module, or
   * undefined for other specifiers.
   */
  provideModule(specifier: string): unknown {
    const isTransport = isSimLambdaHttpModuleSpecifier(specifier);
    if (!isTransport && !specifier.startsWith(awsSdkPackagePrefix)) {
      return undefined;
    }

    const provided = this.providedModules.get(specifier);
    if (provided !== undefined) {
      return provided;
    }

    const hostExports = this.hostModuleExports(specifier);
    const module = isTransport
      ? makeSimLambdaHttpModule({
          hostModule: hostExports as Record<string, unknown>,
          outbound: this.outboundHttp,
          scheme: simLambdaHttpModuleScheme(specifier),
        })
      : this.interceptor.interceptModule(hostExports);
    this.providedModules.set(specifier, module);
    return module;
  }

  /**
   * Which of the given specifiers this provider serves and the host cannot
   * resolve.
   *
   * Resolution only. A package that resolves and then throws while it
   * initializes is installed, and that error belongs to the function code
   * requiring it rather than to a report of what is missing.
   */
  unresolvedModules(specifiers: readonly string[]): readonly string[] {
    return specifiers.filter(
      (specifier) =>
        specifier.startsWith(awsSdkPackagePrefix) && !this.resolves(specifier),
    );
  }

  private resolves(specifier: string): boolean {
    if (this.providedModules.has(specifier)) {
      return true;
    }
    try {
      this.requireModule(specifier);
      return true;
    } catch (error) {
      return !isModuleNotFoundError(error);
    }
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
      throw new SimLambdaSdkPackagesNotInstalledError([specifier], {
        cause: error,
      });
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
