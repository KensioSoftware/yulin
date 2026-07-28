import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimSecretsManagerInvalidParameterException } from "../../error/sim-secrets-manager.error.js";
import type { SimSecretsManagerSecret } from "../../secret/sim-secrets-manager-secret.js";
import type { SimSecretsManagerSecretStore } from "../../secret/sim-secrets-manager-secret-store.js";
import type { SimSecretsManagerAuthorizer } from "../authorize/sim-secrets-manager-authorizer.js";
import { SimSecretsManagerSecretDetail } from "./sim-secrets-manager-secret-detail.js";
import type {
  SimListSecretsCommand,
  SimListSecretsCommandInput,
  SimListSecretsCommandOutput,
} from "./secret.command.js";

const defaultMaxResults = 100;
const maxMaxResults = 100;

interface SimSecretsManagerListSecretsProperties {
  readonly secrets: SimSecretsManagerSecretStore;
  readonly authorizer: SimSecretsManagerAuthorizer;
}

interface SimSecretsManagerListSecretsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The ListSecrets command.
 *
 * Real Secrets Manager gives this action no resource-level permissions, so it
 * authorizes against `*` rather than against each secret, and it does not
 * filter the list by what the caller can read.
 *
 * Secrets scheduled for deletion are left out unless asked for, as real
 * Secrets Manager leaves them out.
 */
export class SimSecretsManagerListSecrets {
  private readonly secrets: SimSecretsManagerSecretStore;
  private readonly authorizer: SimSecretsManagerAuthorizer;
  private readonly detail = new SimSecretsManagerSecretDetail();

  constructor(properties: SimSecretsManagerListSecretsProperties) {
    this.secrets = properties.secrets;
    this.authorizer = properties.authorizer;
  }

  /**
   * List the secrets in this scope.
   */
  handle(
    command: SimListSecretsCommand,
    options?: SimSecretsManagerListSecretsOptions,
  ): SimListSecretsCommandOutput {
    const input = command.input ?? {};

    this.refuseUnsimulatedInput(input);
    this.authorizer.authorizeAny("secretsmanager:ListSecrets", options?.caller);

    const maxResults = this.maxResults(input.MaxResults);
    const startIndex = this.startIndex(input.NextToken);
    const listed = this.listedSecrets(input.IncludePlannedDeletion);
    const page = listed.slice(startIndex, startIndex + maxResults);

    return {
      $metadata: {},
      SecretList: page.map((secret) => this.detail.listEntry(secret)),
      NextToken: this.nextToken(startIndex + maxResults, listed.length),
    };
  }

  /**
   * Refuse the request inputs this simulation does not model.
   *
   * Ignoring a filter would quietly return more secrets than real Secrets
   * Manager would, which is the kind of divergence that makes a passing test
   * mean nothing. Refusing outright is stricter than AWS and deliberate.
   */
  private refuseUnsimulatedInput(input: SimListSecretsCommandInput): void {
    if (input.Filters !== undefined) {
      throw new SimSecretsManagerInvalidParameterException(
        "ListSecrets Filters are not simulated",
      );
    }

    if (input.SortOrder !== undefined) {
      throw new SimSecretsManagerInvalidParameterException(
        "ListSecrets SortOrder is not simulated: secrets are listed in " +
          "creation order",
      );
    }
  }

  private listedSecrets(
    includePlannedDeletion: boolean | undefined,
  ): readonly SimSecretsManagerSecret[] {
    if (includePlannedDeletion === true) {
      return this.secrets.all;
    }

    return this.secrets.all.filter((secret) => !secret.isScheduledForDeletion);
  }

  private maxResults(requested: number | undefined): number {
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
   * from the beginning.
   */
  private startIndex(nextToken: string | undefined): number {
    if (nextToken === undefined) {
      return 0;
    }

    const startIndex = Number(nextToken);

    if (
      !Number.isSafeInteger(startIndex) ||
      startIndex < 0 ||
      String(startIndex) !== nextToken
    ) {
      throw new SimSecretsManagerInvalidParameterException(
        "NextToken is not a token this simulation issued",
      );
    }

    return startIndex;
  }

  private nextToken(
    nextIndex: number,
    listedCount: number,
  ): string | undefined {
    if (nextIndex >= listedCount) {
      return undefined;
    }

    return String(nextIndex);
  }
}
