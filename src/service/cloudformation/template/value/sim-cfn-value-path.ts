/** A key or a list position on the way down to a template value. */
export type SimCfnValuePathSegment = string | number;

interface SimCfnValuePath {
  readonly segments: readonly SimCfnValuePathSegment[];
  readonly reason: string;
}

/**
 * Where in the template each failed value sat.
 *
 * The path is held beside the error rather than on it, so the error thrown by
 * a node keeps its own type and stack while it travels back up.
 */
const valuePaths = new WeakMap<Error, SimCfnValuePath>();

/**
 * Where resolution currently is, as the keys and list positions it descended
 * through to get there.
 *
 * The failure path above is built on the way back up, which only a thrown
 * error travels. Something noticed part way down and carried on, such as a
 * dynamic reference resolved to a stand-in value, has nothing to throw and
 * still has to say which property it happened on. Resolution is synchronous,
 * so one stack pushed and popped by the same wrapper answers that.
 */
const currentPath: SimCfnValuePathSegment[] = [];

/**
 * The property path resolution is inside, written the way an ignored property
 * records one, e.g. `Tags.0.Value`.
 */
export function currentSimCfnValuePath(): string {
  return currentPath.map(String).join(".");
}

/**
 * Resolve a value, naming the key it sat under if it fails.
 *
 * A failure on its own says what was wrong with the expression but not which
 * property held it, which is the part a template author needs. Each container
 * node adds its own key or list position as the failure passes back up, so the
 * path is built without any node having to know where it sits.
 *
 * Only resolution runs in here. A value that does not parse is left alone,
 * because its message already quotes the expression at fault.
 */
export function resolveSimCfnValueAt<T>(
  segment: SimCfnValuePathSegment,
  resolve: () => T,
): T {
  currentPath.push(segment);

  try {
    return resolve();
  } catch (error) {
    rethrowSimCfnValueAt(segment, error);
  } finally {
    currentPath.pop();
  }
}

/**
 * Resolve a template object, naming the subject it belongs to if it fails.
 *
 * The subject is the Resource or Output the values belong to, which the
 * template value resolver has no way to know.
 */
export function resolveSimCfnValueIn<T>(subject: string, resolve: () => T): T {
  try {
    return resolve();
  } catch (error) {
    rethrowSimCfnValueIn(subject, error);
  }
}

function rethrowSimCfnValueAt(
  segment: SimCfnValuePathSegment,
  error: unknown,
): never {
  /* v8 ignore next 3 -- defensive: resolution throws Errors */
  if (!(error instanceof Error)) {
    throw error;
  }

  const path = extendedValuePath(segment, error);
  valuePaths.set(error, path);
  error.message = `value at ${formatSimCfnValuePath(path.segments)}: ${path.reason}`;

  throw error;
}

/**
 * A failure carrying no path is rethrown as it is: it comes from reading the
 * template rather than from one value inside it.
 */
function rethrowSimCfnValueIn(subject: string, error: unknown): never {
  if (!(error instanceof Error)) {
    /* v8 ignore next -- defensive: resolution throws Errors */
    throw error;
  }

  const path = valuePaths.get(error);

  if (path === undefined) {
    throw error;
  }

  error.message = `${subject} value at ${formatSimCfnValuePath(path.segments)}: ${path.reason}`;

  throw error;
}

function extendedValuePath(
  segment: SimCfnValuePathSegment,
  error: Error,
): SimCfnValuePath {
  const path = valuePaths.get(error);

  if (path === undefined) {
    return { segments: [segment], reason: error.message };
  }

  return { segments: [segment, ...path.segments], reason: path.reason };
}

/**
 * Write a value path the way a template author reads it, e.g.
 * `Properties.Origins[0].DomainName`.
 */
function formatSimCfnValuePath(
  segments: readonly SimCfnValuePathSegment[],
): string {
  return segments
    .map((segment, position) => formatSimCfnValuePathSegment(segment, position))
    .join("");
}

function formatSimCfnValuePathSegment(
  segment: SimCfnValuePathSegment,
  position: number,
): string {
  if (typeof segment === "number") {
    return `[${String(segment)}]`;
  }

  if (position === 0) {
    return segment;
  }

  return `.${segment}`;
}
