import timers from "node:timers";
import timersPromises from "node:timers/promises";

/**
 * The host's own timer functions, captured when this module is first
 * evaluated.
 *
 * Simulated Lambda replaces the functions on `node:timers` while a handler
 * runs, so code importing them by name would follow the replacement. The
 * simulator's own scheduling must keep real time whatever invocation it was
 * reached from, so it takes its timers from here.
 */
export const hostSetTimeout = timers.setTimeout;
export const hostClearTimeout = timers.clearTimeout;
export const hostSetInterval = timers.setInterval;
export const hostClearInterval = timers.clearInterval;
export const hostSetTimeoutPromise = timersPromises.setTimeout;
