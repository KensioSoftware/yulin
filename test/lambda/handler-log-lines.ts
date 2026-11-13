/**
 * The platform lines real Lambda writes around every invocation.
 */
const platformLine = /^(?:START|END|REPORT) RequestId: /v;

/**
 * The lines of a function's log group that its handler wrote, leaving out the
 * `START`, `END` and `REPORT` lines the platform writes around each invocation.
 *
 * Kept under `test/` because a test file exporting helpers alongside its own
 * `describe` calls is rejected by lint.
 */
export function handlerLines(
  messages: readonly (string | undefined)[],
): readonly string[] {
  return messages.filter(
    (message): message is string =>
      message !== undefined && !platformLine.test(message),
  );
}
