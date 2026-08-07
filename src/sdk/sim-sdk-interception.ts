import type { SimSdkSendPatch } from "./send-patch.js";

/**
 * One live SDK client interception: a restorable binding from an SDK client
 * instance or client class to simulated AWS.
 */
export class SimSdkInterception implements Disposable {
  private readonly patch: SimSdkSendPatch;

  constructor(patch: SimSdkSendPatch) {
    this.patch = patch;
  }

  /**
   * Whether this interception is still installed on its client.
   */
  isActive(): boolean {
    return this.patch.isInstalled();
  }

  /**
   * Restore the client's real SDK send behaviour.
   */
  restore(): void {
    this.patch.restore();
  }

  /**
   * Restore on dispose, so interceptions work with `using` declarations.
   */
  // oxlint-disable-next-line unicorn-js/no-nonstandard-builtin-properties -- Symbol.dispose is standard from ES2024; the lint rule does not know it yet.
  [Symbol.dispose](): void {
    this.restore();
  }
}
