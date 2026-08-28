import type { AwsRegionName } from "../../service/aws/sim-aws-region.js";
import { installSendPatch, type SimSdkSendHandler } from "../send-patch.js";
import { SimSdkStaticClientFactories } from "./sim-sdk-static-client-factory.js";

/**
 * An SDK client class: a constructable whose instances have a send method.
 */
type SimSdkClientConstructor = new (...arguments_: unknown[]) => object;

interface SimSdkModuleClientInterceptorProperties {
  readonly sendHandler: SimSdkSendHandler;
  readonly defaultRegionName?: AwsRegionName | undefined;
}

/**
 * Intercepts the SDK client classes exported by an AWS SDK package module.
 *
 * Client classes are wrapped so every instance constructed from the wrapped
 * module gets a per-instance simulated send patch. The patch shadows send as
 * an own property on the instance, so the real class prototype is never
 * modified and nothing leaks to code using the module directly.
 *
 * All other exports, such as Command classes, error classes and constants,
 * pass through untouched by identity, so instanceof checks and command
 * construction behave exactly as with the real module.
 */
export class SimSdkModuleClientInterceptor {
  private readonly sendHandler: SimSdkSendHandler;
  private readonly defaultRegionName: AwsRegionName | undefined;

  constructor(properties: SimSdkModuleClientInterceptorProperties) {
    this.sendHandler = properties.sendHandler;
    this.defaultRegionName = properties.defaultRegionName;
  }

  /**
   * Build an intercepted copy of a module's exports.
   *
   * The source exports object is never mutated: the host module registry
   * caches it process-wide, so mutation would leak interception into code
   * importing the module normally.
   */
  interceptModule(moduleExports: object): object {
    const intercepted: Record<string, unknown> = {};
    for (const [exportName, exportValue] of Object.entries(moduleExports)) {
      // oxlint-disable-next-line security/detect-object-injection -- copying the module's own export names verbatim.
      intercepted[exportName] = this.interceptExport(exportValue);
    }
    return intercepted;
  }

  private interceptExport(exportValue: unknown): unknown {
    if (this.isClientClass(exportValue)) {
      return this.wrapClientClass(exportValue);
    }
    return exportValue;
  }

  /**
   * SDK v3 client classes inherit send from the smithy Client base class, so
   * a prototype-chain check finds clients while Command classes and other
   * function exports pass through.
   */
  private isClientClass(value: unknown): value is SimSdkClientConstructor {
    if (typeof value !== "function") {
      return false;
    }
    const prototype = (value as { prototype?: { send?: unknown } }).prototype;
    return typeof prototype?.send === "function";
  }

  /**
   * Wrap a client class so constructed instances are send-patched.
   *
   * Reflect.construct with the incoming new target preserves subclassing and
   * instanceof against the real class.
   *
   * The class's own static methods are wrapped as well, so a client built by
   * a static factory such as `DynamoDBDocumentClient.from` is patched too.
   * Such a factory constructs from the class binding it closes over rather
   * than through this proxy, so the construct trap never sees it.
   */
  private wrapClientClass(
    clientClass: SimSdkClientConstructor,
  ): SimSdkClientConstructor {
    const sendHandler = this.sendHandler;
    const configureArguments = (constructorArguments: unknown[]): unknown[] =>
      this.regionDefaultedArguments(constructorArguments);
    const staticFactories = new SimSdkStaticClientFactories(sendHandler);

    return new Proxy(clientClass, {
      construct(
        target: SimSdkClientConstructor,
        constructorArguments: unknown[],
        newTarget: Function, // oxlint-disable-line typescript/no-unsafe-function-type -- ProxyHandler construct trap signature.
      ): object {
        const instance = Reflect.construct(
          target,
          configureArguments(constructorArguments),
          newTarget,
        ) as object;
        installSendPatch(instance, sendHandler);
        return instance;
      },

      get(
        target: SimSdkClientConstructor,
        property: string | symbol,
        receiver: unknown,
      ): unknown {
        const value: unknown = Reflect.get(target, property, receiver);
        if (typeof value !== "function" || !Object.hasOwn(target, property)) {
          return value;
        }
        return staticFactories.wrap(value);
      },
    });
  }

  /**
   * Default the client configuration region, as the real Lambda runtime does
   * by supplying AWS_REGION to the SDK's environment region provider.
   *
   * An explicit region in the constructed configuration always wins.
   */
  private regionDefaultedArguments(constructorArguments: unknown[]): unknown[] {
    if (this.defaultRegionName === undefined) {
      return constructorArguments;
    }

    const [configuration, ...rest] = constructorArguments;
    if (!this.isConfigurationObject(configuration)) {
      return constructorArguments;
    }

    if (configuration?.["region"] !== undefined) {
      return constructorArguments;
    }

    return [{ ...configuration, region: this.defaultRegionName }, ...rest];
  }

  private isConfigurationObject(
    configuration: unknown,
  ): configuration is Record<string, unknown> | undefined {
    if (configuration === undefined) {
      return true;
    }
    return typeof configuration === "object" && configuration !== null;
  }
}
