/**
 * What the function behind a user pool trigger does in a test.
 *
 * These are the handler bodies, kept apart from the pool that runs them in
 * `trigger-fixture.ts`, because a suite usually varies one without touching the
 * other. They live under `test/` for the same reason everything else there
 * does: eslint rejects a test file exporting helpers alongside its own
 * `describe` calls.
 */

/**
 * Record every event the handler is given, and hand the event back so the
 * request it fired for carries on.
 */
export function recordingTriggerHandler(
  events: unknown[],
): (event: unknown) => unknown {
  return (event: unknown) => {
    events.push(structuredClone(event));

    return event;
  };
}

/**
 * Answer the pre sign-up flags a test named, leaving the rest of the event as
 * it arrived.
 */
export function answeringTriggerHandler(
  answer: Readonly<Record<string, boolean>>,
): (event: { response: Record<string, boolean> }) => unknown {
  return (event: { response: Record<string, boolean> }) => {
    Object.assign(event.response, answer);

    return event;
  };
}

/**
 * Answer with one `claimsOverrideDetails`, which is how a `PreTokenGeneration`
 * handler says what a token is to carry.
 */
export function claimsOverrideHandler(
  details: unknown,
): (event: unknown) => unknown {
  return (event: unknown) => ({
    ...(event as object),
    response: { claimsOverrideDetails: details },
  });
}
