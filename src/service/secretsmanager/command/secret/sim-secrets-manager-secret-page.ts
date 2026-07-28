import { SimSecretsManagerInvalidParameterException } from "../../error/sim-secrets-manager.error.js";
import type { SimSecretsManagerSecret } from "../../secret/sim-secrets-manager-secret.js";

const defaultMaxResults = 100;
const maxMaxResults = 100;

/**
 * The paging fields a ListSecrets request carries.
 */
export interface SimSecretsManagerSecretPageInput {
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}

/**
 * One page of listed secrets, and the token that reaches the next one.
 */
export class SimSecretsManagerSecretPage {
  public readonly secrets: readonly SimSecretsManagerSecret[];
  public readonly nextToken: string | undefined;

  constructor(
    listed: readonly SimSecretsManagerSecret[],
    input: SimSecretsManagerSecretPageInput,
  ) {
    const maxResults = SimSecretsManagerSecretPage.maxResults(input.MaxResults);
    const startIndex = SimSecretsManagerSecretPage.startIndex(
      input.NextToken,
      listed.length,
    );
    const nextIndex = startIndex + maxResults;

    this.secrets = listed.slice(startIndex, nextIndex);
    this.nextToken = SimSecretsManagerSecretPage.tokenFor(
      nextIndex,
      listed.length,
    );
  }

  private static maxResults(requested: number | undefined): number {
    const maxResults = requested ?? defaultMaxResults;

    if (
      !Number.isSafeInteger(maxResults) ||
      maxResults < 1 ||
      maxResults > maxMaxResults
    ) {
      throw new SimSecretsManagerInvalidParameterException(
        `MaxResults must be a whole number between 1 and ${String(maxMaxResults)}`,
      );
    }

    return maxResults;
  }

  /**
   * Read a continuation token as its offset into the listed secrets.
   *
   * Tokens are the canonical non-negative integer representation this command
   * emits, so anything else is rejected rather than silently starting again
   * from the beginning. An offset past the end of the list is rejected for the
   * same reason: no such token is ever issued, so answering one with an empty
   * page would be answering a question that was never validly asked.
   */
  private static startIndex(
    nextToken: string | undefined,
    listedCount: number,
  ): number {
    if (nextToken === undefined) {
      return 0;
    }

    const startIndex = Number(nextToken);

    if (
      !Number.isSafeInteger(startIndex) ||
      startIndex < 0 ||
      startIndex >= listedCount ||
      String(startIndex) !== nextToken
    ) {
      throw new SimSecretsManagerInvalidParameterException(
        "NextToken is not a token this simulation issued",
      );
    }

    return startIndex;
  }

  private static tokenFor(
    nextIndex: number,
    listedCount: number,
  ): string | undefined {
    if (nextIndex >= listedCount) {
      return undefined;
    }

    return String(nextIndex);
  }
}
