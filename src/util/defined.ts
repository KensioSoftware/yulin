class RequiredValueUndefinedError extends Error {
  //
}

/**
 * Require that a given value is defined.
 */
export function assertDefined<T>(
  value: T | undefined,
  description: string,
): asserts value is T {
  if (value === undefined) {
    throw new RequiredValueUndefinedError(`${description} must be defined`);
  }
}
