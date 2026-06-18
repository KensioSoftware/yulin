class RequiredValueUndefinedError extends Error {
  //
}

class RequiredValueNullError extends Error {
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

/**
 * Require that a given value is not null.
 */
export function assertNotNull<T>(
  value: T | null,
  description: string,
): asserts value is T {
  if (value === null) {
    throw new RequiredValueNullError(`${description} must not be null`);
  }
}
