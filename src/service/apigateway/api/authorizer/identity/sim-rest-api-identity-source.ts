/**
 * Where an authorizer takes what it identifies the caller by.
 *
 * An identity source is a request mapping expression. Each kind reads from
 * somewhere different and answers the same question, so reading a list of them
 * is a loop rather than a switch over kinds.
 *
 * A source the request supplies nothing at is what refuses a request before
 * the authorizer is invoked.
 */
export interface SimRestApiIdentitySource {
  /**
   * The expression as it was written, which is what the API reports back.
   */
  readonly expression: string;

  /**
   * What this request carries at this identity source, if it carries anything.
   *
   * An empty value is the same as no value here: real API Gateway treats a
   * source it finds nothing at as one the request did not supply, and refuses
   * the request without asking the authorizer anything.
   */
  value(request: Request): string | undefined;
}

/**
 * A value the request actually supplied, rather than an empty one.
 *
 * The value is answered as it arrived, and trimmed only to decide whether the
 * request supplied anything at all. What is around a value is part of it,
 * since an authorizer is handed what the client sent.
 */
export function simRestApiIdentityValue(
  value: string | null,
): string | undefined {
  if (value === null || value.trim().length === 0) {
    return undefined;
  }

  return value;
}
