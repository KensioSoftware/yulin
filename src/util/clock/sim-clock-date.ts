import type { SimClock } from "./sim-clock.js";

/**
 * Build a Date constructor reporting a simulation's time.
 *
 * Controlling a simulation's clock is only half of what a test wants if the
 * code under test asks JavaScript for the time instead of asking the
 * simulator. This is the substitute to give that code: `Date.now()` and
 * `new Date()` read the simulation's clock, and everything else about Date
 * behaves as it always did.
 *
 * A Proxy rather than a subclass, because a subclass would introduce a second
 * Date identity: `instanceof` and `Date.prototype` have to keep pointing at
 * the same objects, or dates built anywhere else stop being recognised as
 * dates by code holding this constructor.
 *
 * The clock is read per call, so freezing and advancing take effect on the
 * next read rather than at the moment this is built.
 */
export function makeSimClockDate(clock: SimClock): DateConstructor {
  // Captured before anything replaces the global, so a clock implemented in
  // terms of `new Date()` cannot end up calling back into this substitute.
  const hostDate = Date;
  const nowMs = (): number => clock.now().getTime();

  return new Proxy(hostDate, {
    // Called without `new`, Date reports the current time as a string and
    // ignores whatever arguments it was given.
    apply: (): string => new hostDate(nowMs()).toString(),

    construct: (target, constructorArguments: unknown[], newTarget): object => {
      // Only the no-argument form asks for the current time. Every other form
      // states the instant it wants, so it is left alone.
      if (constructorArguments.length === 0) {
        return Reflect.construct(target, [nowMs()], newTarget) as Date;
      }

      return Reflect.construct(target, constructorArguments, newTarget) as Date;
    },

    get: (target, property, receiver): unknown => {
      if (property === "now") {
        return nowMs;
      }

      return Reflect.get(target, property, receiver);
    },
  });
}
