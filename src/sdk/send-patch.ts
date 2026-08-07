import {
  SimSdkAlreadyInterceptedError,
  SimSdkCallbackNotSupportedError,
} from "./error/sim-sdk.error.js";

/**
 * All send functions installed by simulated SDK interception, so a second
 * interception of an already-intercepted target can be rejected, including
 * across separate SimSdk instances.
 */
const installedSends = new WeakSet<object>();

/**
 * Handler for SDK Commands sent through a patched client send method.
 * Receives the SDK Command instance and the client send was called on.
 */
export type SimSdkSendHandler = (
  command: object,
  client: unknown,
) => Promise<unknown>;

/**
 * An installed send patch on one SDK client instance or client class
 * prototype.
 */
export interface SimSdkSendPatch {
  /**
   * Whether the patched send is still the one installed on the target.
   */
  isInstalled(): boolean;

  /**
   * Restore the send behaviour the target had before this patch.
   *
   * Does nothing if the patched send was replaced after installation, so a
   * later patch by other code is never clobbered.
   */
  restore(): void;
}

/**
 * Install a simulated send method on an SDK client instance or client class
 * prototype.
 *
 * The patch shadows the inherited SDK send with an own property, which is why
 * no SDK import is needed: restoring simply removes the shadow so the real
 * inherited send resolves again.
 */
export function installSendPatch(
  target: object,
  handler: SimSdkSendHandler,
): SimSdkSendPatch {
  const previous = Object.getOwnPropertyDescriptor(target, "send");
  const previousSend: unknown = previous?.value;
  if (typeof previousSend === "function" && installedSends.has(previousSend)) {
    throw new SimSdkAlreadyInterceptedError(
      `SDK client ${patchTargetName(target)} is already intercepted; ` +
        `restore the existing interception before intercepting it again`,
    );
  }

  const patched = async function (
    this: unknown,
    command: object,
    ...rest: unknown[]
  ): Promise<unknown> {
    const callback = rest.find((argument) => typeof argument === "function");
    if (callback !== undefined) {
      throw new SimSdkCallbackNotSupportedError(
        "Simulated SDK interception does not support callback-style send; " +
          "use the promise form instead",
      );
    }
    // oxlint-disable-next-line unicorn-js/no-this-outside-of-class -- this is the client instance send was called on, which the handler needs for per-send config resolution.
    return await handler(command, this);
  };

  installedSends.add(patched);
  Object.defineProperty(target, "send", {
    value: patched,
    writable: true,
    configurable: true,
  });

  const isInstalled = (): boolean =>
    Object.getOwnPropertyDescriptor(target, "send")?.value === patched;

  return {
    isInstalled,
    restore(): void {
      if (!isInstalled()) {
        return;
      }
      if (previous === undefined) {
        Reflect.deleteProperty(target, "send");
        return;
      }
      Object.defineProperty(target, "send", previous);
    },
  };
}

/**
 * Name a patch target for diagnostics: the client's class name for instances
 * and prototypes alike, when it has one.
 */
function patchTargetName(target: object): string {
  const constructor = (target as { constructor?: { name?: string } })
    .constructor;
  return constructor?.name ?? "target";
}
