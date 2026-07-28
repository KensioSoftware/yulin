import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimSecretsManagerInvalidParameterException } from "../../error/sim-secrets-manager.error.js";
import type { SimSecretsManagerSecret } from "../../secret/sim-secrets-manager-secret.js";
import type { SimSecretsManagerSecretStore } from "../../secret/sim-secrets-manager-secret-store.js";
import type { SimSecretsManagerAuthorizer } from "../authorize/sim-secrets-manager-authorizer.js";
import { SimSecretsManagerSecretDetail } from "./sim-secrets-manager-secret-detail.js";
import { SimSecretsManagerSecretPage } from "./sim-secrets-manager-secret-page.js";
import type {
  SimListSecretsCommand,
  SimListSecretsCommandInput,
  SimListSecretsCommandOutput,
} from "./secret.command.js";

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

    const page = new SimSecretsManagerSecretPage(
      this.listedSecrets(input.IncludePlannedDeletion),
      input,
    );

    return {
      $metadata: {},
      SecretList: page.secrets.map((secret) => this.detail.listEntry(secret)),
      NextToken: page.nextToken,
    };
  }

  /**
   * Refuse the request inputs this simulation does not model.
   *
   * Ignoring a filter would quietly return more secrets than real Secrets
   * Manager would, and ignoring a sort would return them in an order the
   * caller did not ask for. Either is the kind of divergence that makes a
   * passing test mean nothing, so both are refused outright, which is stricter
   * than AWS and deliberate.
   */
  private refuseUnsimulatedInput(input: SimListSecretsCommandInput): void {
    if (input.Filters !== undefined) {
      throw new SimSecretsManagerInvalidParameterException(
        "ListSecrets Filters are not simulated",
      );
    }

    if (input.SortOrder !== undefined || input.SortBy !== undefined) {
      throw new SimSecretsManagerInvalidParameterException(
        "ListSecrets SortOrder and SortBy are not simulated: secrets are " +
          "listed in creation order",
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
}
