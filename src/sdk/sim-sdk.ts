import { SimAws } from "../service/aws/sim-aws.js";
import { SimSdkInvalidClientError } from "./error/sim-sdk.error.js";
import { installSendPatch } from "./send-patch.js";
import { SimSdkCommandDispatcher } from "./sim-sdk-command-dispatcher.js";
import { SimSdkInterception } from "./sim-sdk-interception.js";

interface SimSdkProperties {
  readonly simAws?: SimAws;
}

/**
 * An SDK Command type given to an interception's Command allow list, such as
 * an SDK Command class. Only the name is read; the SDK itself is never
 * imported by simulated AWS.
 */
export interface SimSdkCommandType {
  readonly name: string;
}

/**
 * Options for intercepting one SDK client instance or client class.
 */
export interface SimSdkInterceptOptions {
  /**
   * Only intercept these SDK Commands, given as Command classes or Command
   * names. All Commands are intercepted when omitted.
   */
  readonly commands?: readonly (SimSdkCommandType | string)[];
}

/**
 * An SDK client instance or client class to intercept.
 */
export type SimSdkInterceptTarget = object;

/**
 * The simulated AWS SDK.
 *
 * Intercepts AWS SDK client sends and routes their Commands to simulated AWS
 * services, so implementation code using SDK clients never needs to know it
 * is dealing with simulated AWS behind the scenes.
 *
 * Owns a SimAws instance, created on demand or supplied, so most tests can
 * work through intercepted SDK clients alone and never touch SimAws directly.
 */
export class SimSdk implements Disposable {
  public readonly simAws: SimAws;

  private readonly dispatcher: SimSdkCommandDispatcher;
  private readonly interceptions = new Set<SimSdkInterception>();

  constructor(properties: SimSdkProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.simAws = simAws;
    this.dispatcher = new SimSdkCommandDispatcher(simAws);
  }

  /**
   * Intercept an SDK client instance or client class.
   *
   * Intercepting a class intercepts every instance of it. The Account/Region
   * scope and caller are resolved per send, never per client: from the
   * ambient SimAws.runAs caller and the sending client's configured Region,
   * falling back to the SimAws defaults.
   */
  intercept(
    target: SimSdkInterceptTarget,
    options: SimSdkInterceptOptions = {},
  ): SimSdkInterception {
    const commandNames = interceptedCommandNames(options);
    const patch = installSendPatch(
      patchTarget(target),
      async (command, client) =>
        await this.dispatcher.dispatch(command, client, commandNames),
    );

    const interception = new SimSdkInterception(patch);
    this.interceptions.add(interception);
    return interception;
  }

  /**
   * Restore the real SDK send behaviour of every client intercepted through
   * this SimSdk.
   */
  restoreAll(): void {
    for (const interception of this.interceptions) {
      interception.restore();
    }
    this.interceptions.clear();
  }

  /**
   * Restore all on dispose, so a SimSdk works with `using` declarations.
   */
  // eslint-disable-next-line unicorn/no-nonstandard-builtin-properties -- Symbol.dispose is standard from ES2024; the lint rule does not know it yet.
  [Symbol.dispose](): void {
    this.restoreAll();
  }
}

/**
 * Normalize an interception's Command allow list to Command names.
 */
function interceptedCommandNames(
  options: SimSdkInterceptOptions,
): ReadonlySet<string> | undefined {
  if (options.commands === undefined) {
    return undefined;
  }
  return new Set(
    options.commands.map((command) =>
      typeof command === "string" ? command : command.name,
    ),
  );
}

/**
 * Resolve the object to patch for an interception target: the target itself
 * for a client instance, or the prototype for a client class.
 */
function patchTarget(target: SimSdkInterceptTarget): object {
  if (typeof target !== "function") {
    return target;
  }
  const prototype = (target as { prototype?: unknown }).prototype;
  if (typeof prototype !== "object" || prototype === null) {
    throw new SimSdkInvalidClientError(
      "Intercepted SDK client class has no prototype to patch",
    );
  }
  return prototype;
}
