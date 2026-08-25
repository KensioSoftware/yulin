/* oxlint-disable security/detect-possible-timing-attacks -- a client request
   token is an idempotency key a caller chooses and sends in the clear. Nothing
   here compares a secret, so there is no timing to leak. */

import { SimAthenaInvalidRequestException } from "../error/sim-athena.error.js";

/**
 * The queries a `ClientRequestToken` has already started.
 *
 * A token makes `StartQueryExecution` idempotent. A client that retries after
 * a timeout sends the same token and gets the same execution back rather than
 * running the query twice, which is the whole point of the field for an API
 * that bills per byte scanned.
 *
 * Accepting a token and ignoring it would be the worse kind of divergence: a
 * retry would look right and cost twice.
 */
export class SimAthenaQueryTokens {
  private readonly startedQueries = new Map<
    string,
    { readonly queryString: string; readonly queryExecutionId: string }
  >();

  /**
   * The execution this token already started, if it started one.
   *
   * A token reused for a different query is refused. Real Athena answers
   * `IdempotentParameterMismatch`, because the token no longer identifies one
   * request.
   */
  startedBy(
    token: string | undefined,
    queryString: string,
  ): string | undefined {
    const started =
      token === undefined ? undefined : this.startedQueries.get(token);

    if (started === undefined) {
      return undefined;
    }

    if (started.queryString !== queryString) {
      throw new SimAthenaInvalidRequestException(
        `ClientRequestToken ${String(token)} has already been used for a ` +
          `different query. A token identifies one request.`,
      );
    }

    return started.queryExecutionId;
  }

  /**
   * Remember which execution a token started.
   *
   * A request carrying no token is nothing to remember. It is not idempotent,
   * which is what sending no token asks for.
   */
  record(
    token: string | undefined,
    queryString: string,
    queryExecutionId: string,
  ): void {
    if (token === undefined) {
      return;
    }

    this.startedQueries.set(token, { queryString, queryExecutionId });
  }
}
