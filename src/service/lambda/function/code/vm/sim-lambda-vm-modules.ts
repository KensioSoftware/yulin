import { createRequire, isBuiltin } from "node:module";
import path from "node:path";
import vm from "node:vm";
import type { SimZipArchive } from "../../../../../util/zip/zip-archive.js";
import { SimLambdaRuntimeError } from "../../../error/sim-lambda-runtime.error.js";
import { SimLambdaVmModuleResolver } from "./sim-lambda-vm-module-resolver.js";

/**
 * Sim Lambda module code runs synchronously at import time, so evaluation is
 * bounded like real Lambda bounds its init phase.
 */
const moduleEvaluationTimeoutMs = 5000;

const hostRequire = createRequire(import.meta.url);

interface SimLambdaVmModulesProperties {
  readonly archive: SimZipArchive;
  readonly context: vm.Context;
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

    const filePath = this.resolver.resolveFilePath(specifier, fromDirectory);
    const loaded = this.modules.get(filePath);
    if (loaded !== undefined) {
      return loaded.exports;
    }
    return this.loadModule(filePath).exports;
  }

  private loadModule(filePath: string): VmModule {
    const module: VmModule = { exports: {} };
    // Register before evaluation so require cycles observe partial exports,
    // as in Node.js.
    this.modules.set(filePath, module);

    const moduleDirectory = path.posix.dirname(filePath);
    this.compileModule(filePath)(
      module.exports,
      (specifier: string) => this.requireModule(specifier, moduleDirectory),
      module,
      filePath,
      moduleDirectory,
    );
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
      throw this.userCodeSyntaxError(filePath, error);
    }

    return script.runInContext(this.properties.context, {
      timeout: moduleEvaluationTimeoutMs,
      breakOnSigint: true,
    }) as CommonJsModuleFunction;
  }

  private userCodeSyntaxError(
    filePath: string,
    error: unknown,
  ): SimLambdaRuntimeError {
    let message = String(error);
    if (error instanceof Error) {
      message = error.message;
    }

    if (message.includes("import statement") || message.includes("'export'")) {
      message +=
        "; sim Lambda only supports CommonJS function code so far - " +
        "use exports.handler = ... instead of ES module syntax";
    }

    return new SimLambdaRuntimeError(
      "Runtime.UserCodeSyntaxError",
      `Syntax error in ${filePath}: ${message}`,
    );
  }
}
