import { AsyncLocalStorage } from "node:async_hooks";
import type { SimAwsPrincipal } from "./sim-aws-caller.js";

/**
 * The SimAws instance an ambient caller belongs to.
 *
 * Each SimAws instance is its own isolated simulated AWS universe, with its
 * own Accounts and IAM state, so ambient callers are tracked per instance: a
 * caller only has meaning within the SimAws it was set for, and a run-as on
 * one SimAws never affects what another SimAws observes. The owner is typed
 * as a bare object because only its identity is used, as a key; this also
 * keeps this module free of a runtime SimAws dependency.
 */
export type SimAwsRunAsOwner = object;

/**
 * The ambient caller for each SimAws instance currently inside a run.
 */
type SimAwsRunAsCallers = ReadonlyMap<SimAwsRunAsOwner, SimAwsPrincipal>;

const storage = new AsyncLocalStorage<SimAwsRunAsCallers>();

/**
 * Ambient simulated caller context, tracked with Node.js asynchronous context
 * tracking.
 *
 * The caller is the simulated principal, such as an IAM Role, that simulated
 * AWS operations are attributed to while the run executes: the simulated
 * answer to "who is making these AWS calls?". It is ambient in that it
 * applies to everything called during the run, without being passed
 * explicitly.
 *
 * Callers are keyed by owning SimAws instance. Nested runs stack: the
 * innermost caller wins for its own SimAws, a run for a different SimAws
 * leaves this one's caller visible throughout, and each SimAws gets its
 * previous caller back when a nested run completes.
 */
export const simAwsRunAsContext = {
  /**
   * Run a function with an ambient caller for one owning SimAws instance.
   */
  async run<T>(
    owner: SimAwsRunAsOwner,
    caller: SimAwsPrincipal,
    run: () => Promise<T>,
  ): Promise<T> {
    const callers = new Map(storage.getStore());
    callers.set(owner, caller);
    return await storage.run(callers, run);
  },

  /**
   * Get the current ambient caller for one owning SimAws instance, if a run
   * is active for it.
   */
  currentCaller(owner: SimAwsRunAsOwner): SimAwsPrincipal | undefined {
    return storage.getStore()?.get(owner);
  },
};
