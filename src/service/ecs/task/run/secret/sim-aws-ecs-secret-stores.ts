import type {
  SimAwsAccountRegionContainer,
  SimAwsAccountRegionScope,
} from "../../../../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../../../../aws/sim-aws.js";
import type { SimEcsSecretReference } from "./sim-ecs-secret-reference.js";
import type {
  SimEcsSecretRead,
  SimEcsSecretStores,
} from "./sim-ecs-secret-stores.js";
import { SimEcsSecretResolutionError } from "./sim-ecs-secret.error.js";

interface SimAwsEcsSecretStoresProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The simulated Secrets Manager and SSM Parameter Store of one simulated AWS
 * instance, as the places a task's container secrets are read from.
 *
 * The store is reached when a task starts, never when this is built, for the
 * same reason S3's notification destinations do it that way: reaching another
 * service while this one is being constructed is a cycle with no bottom to it.
 *
 * A reference naming another Account or Region is read there. Real ECS requires
 * a secret to be in the task's own Region and allows another Account's through
 * a resource policy, but a reference carries the scope it names either way, and
 * reading it where it says it is keeps a wrong Region a missing secret rather
 * than a secret of the same name in the task's own.
 */
export class SimAwsEcsSecretStores implements SimEcsSecretStores {
  private readonly simAws: SimAws;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimAwsEcsSecretStoresProperties) {
    this.simAws = properties.simAws;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Read one secret's value as the caller the request names.
   */
  async read(request: SimEcsSecretRead): Promise<string> {
    if (request.reference.store === "secretsmanager") {
      return await this.secretString(request);
    }

    return await this.parameterValue(request);
  }

  private async secretString(request: SimEcsSecretRead): Promise<string> {
    const { reference } = request;
    const answer = await this.scopeFor(reference)
      .secretsManager()
      .getSecretValue(
        {
          input: {
            SecretId: reference.identifier,
            ...(reference.versionId !== undefined && {
              VersionId: reference.versionId,
            }),
            ...(reference.versionStage !== undefined && {
              VersionStage: reference.versionStage,
            }),
          },
        },
        { caller: request.caller },
      );

    if (answer.SecretString === undefined) {
      throw new SimEcsSecretResolutionError(
        `${reference.identifier} holds a binary value, and only a string ` +
          `secret can become an environment variable.`,
      );
    }

    return answer.SecretString;
  }

  /**
   * Read a parameter, decrypting it, as a real task agent does.
   *
   * `WithDecryption` is always on, because a `SecureString` is the only kind of
   * parameter worth putting in `secrets` and a real task gets its plaintext.
   * Parameter Store ignores the flag for the types it stores in the clear.
   */
  private async parameterValue(request: SimEcsSecretRead): Promise<string> {
    const { reference } = request;
    const answer = await this.scopeFor(reference)
      .ssm()
      .getParameter(
        { input: { Name: reference.identifier, WithDecryption: true } },
        { caller: request.caller },
      );

    if (answer.Parameter?.Value === undefined) {
      throw new SimEcsSecretResolutionError(
        `${reference.identifier} has no value to read.`,
      );
    }

    return answer.Parameter.Value;
  }

  /**
   * The Account and Region a reference is read in, which is the task's own
   * where the reference named none.
   */
  private scopeFor(
    reference: SimEcsSecretReference,
  ): SimAwsAccountRegionContainer {
    return this.simAws.accountRegionScope(
      reference.accountId ?? this.accountRegionScope.accountId,
      reference.regionName ?? this.accountRegionScope.regionName,
    );
  }
}
