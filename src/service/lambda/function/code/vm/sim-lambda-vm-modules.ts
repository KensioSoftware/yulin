import { createRequire, isBuiltin } from "node:module";
import path from "node:path";
import vm from "node:vm";
import type { SimZipArchive } from "../../../../../util/zip/zip-archive.js";
import type { SimLambdaVmSdkModuleProvider } from "./sdk/sim-lambda-vm-sdk-module-provider.js";
import { loadJsonModule } from "./sim-lambda-vm-json-module.js";
import { SimLambdaVmModuleResolver } from "./sim-lambda-vm-module-resolver.js";
import { userCodeSyntaxError } from "./sim-lambda-vm-syntax-error.js";

/**
 * Sim Lambda module code runs synchronously at import time, so evaluation is
 * bounded like real Lambda bounds its init phase.
 */
const moduleEvaluationTimeoutMs = 5000;

const hostRequire = createRequire(import.meta.url);

interface SimLambdaVmModulesProperties {
  readonly archive: SimZipArchive;
  readonly context: vm.Context;
  readonly sdkModuleProvider: SimLambdaVmSdkModuleProvider;
}

interface VmModule {
  exports: unknown;
}

type CommonJsModuleFunction = (
  exports: unknown,
  require: (specifier: string) => unknown,
  module: VmModule,
  filename: string,
  dirname: string,
) => void;

/**
 * A CommonJS module system over a sim Lambda function code zip archive.
 *
 * Modules are compiled and evaluated inside the function's vm context.
 * Node.js built-in modules resolve to the real host built-ins, as the real
 * Lambda Node.js runtime provides them; everything else must be bundled in
 * the archive.
 */
export class SimLambdaVmModules {
  private readonly modules = new Map<string, VmModule>();
  private readonly resolver: SimLambdaVmModuleResolver;

  constructor(private readonly properties: SimLambdaVmModulesProperties) {
    this.resolver = new SimLambdaVmModuleResolver(properties.archive);
  }

  /**
   * Require a module by specifier, as CommonJS code in the archive would.
   */
  requireModule(specifier: string, fromDirectory = "."): unknown {
    if (isBuiltin(specifier)) {
      return hostRequire(specifier);
    }

    let filePath: string;
    try {
      filePath = this.resolver.resolveFilePath(specifier, fromDirectory);
    } catch (archiveError) {
      return this.provideModule(specifier, archiveError);
    }

    const loaded = this.modules.get(filePath);
    if (loaded !== undefined) {
      return loaded.exports;
    }
    return this.loadModule(filePath).exports;
  }

  /**
   * Provide a runtime module the archive does not bundle, as the real Lambda
   * runtime provides the AWS SDK.
   *
   * The archive always takes precedence: the provider is only consulted for
   * specifiers the archive cannot resolve, and when it declines, the
   * original archive resolution error is reported.
   */
  private provideModule(specifier: string, archiveError: unknown): unknown {
    const provided = this.properties.sdkModuleProvider.provideModule(specifier);
    if (provided === undefined) {
      throw archiveError;
    }
    return provided;
  }

  private loadModule(filePath: string): VmModule {
    if (filePath.endsWith(".json")) {
      const jsonModule: VmModule = {
        exports: loadJsonModule(this.properties.archive, filePath),
      };
      this.modules.set(filePath, jsonModule);
      return jsonModule;
    }

    const module: VmModule = { exports: {} };
    // Register before evaluation so require cycles observe partial exports,
    // as in Node.js.
    this.modules.set(filePath, module);

    try {
      const moduleDirectory = path.posix.dirname(filePath);
      this.compileModule(filePath)(
        module.exports,
        (specifier: string) => this.requireModule(specifier, moduleDirectory),
        module,
        filePath,
        moduleDirectory,
      );
    } catch (error) {
      // Evict the failed module so a later require re-attempts evaluation
      // instead of observing empty exports, as in Node.js.
      this.modules.delete(filePath);
      throw error;
    }
    return module;
  }

  private compileModule(filePath: string): CommonJsModuleFunction {
    const source = this.properties.archive.file(filePath).toString();
    const wrapped = `(function (exports, require, module, __filename, __dirname) {\n${
      source
    }\n})`;

    let script: vm.Script;
    try {
      script = new vm.Script(wrapped, { filename: filePath });
    } catch (error) {
      throw userCodeSyntaxError(filePath, error);
    }

    return script.runInContext(this.properties.context, {
      timeout: moduleEvaluationTimeoutMs,
      breakOnSigint: true,
    }) as CommonJsModuleFunction;
  }
}
