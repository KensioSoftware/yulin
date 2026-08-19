import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type {
  SimCfnDynamicReference,
  SimCfnDynamicReferenceResolution,
  SimCfnDynamicReferenceResolver,
} from "../../../cloudformation/template/dynamic/sim-cfn-dynamic-reference.type.js";
import { SimSecretsManagerError } from "../../error/sim-secrets-manager.error.js";
import type { SimSecretsManager } from "../../sim-secrets-manager.js";
import { simCfnSecretsManagerJsonKeyValue } from "./sim-cfn-secrets-manager-json-key.js";
import {
  parseSimCfnSecretsManagerReference,
  type SimCfnSecretsManagerReference,
  SimCfnSecretsManagerReferenceProblem,
} from "./sim-cfn-secrets-manager-reference-body.js";

interface SimCfnSecretsManagerDynamicReferenceResolverProperties {
  /** Secrets Manager for the Account and Region the Stack deploys into. */
  readonly secretsManager: SimSecretsManager;

  /** Secrets Manager for another Account and Region, which a full ARN names. */
  readonly secretsManagerIn: (
    scope: SimAwsAccountRegionScope,
  ) => SimSecretsManager;
}

/**
 * Answers `{{resolve:secretsmanager:...}}` references from simulated Secrets
 * Manager.
 *
 * The secret is read as the caller deploying the Stack would read it, at the
 * point the Resource holding the reference is created. Real CloudFormation
 * makes no dependency out of a dynamic reference, so a secret another Resource
 * of the same Stack creates is only there in time if the template says
 * `DependsOn`.
 *
 * Reading goes through the ordinary GetSecretValue command, which decrypts the
 * version through simulated KMS, so the answer comes back as a promise. That
 * is what the CloudFormation engine waits on around its otherwise synchronous
 * property resolution.
 *
 * Anything Secrets Manager cannot answer becomes a stand-in value carrying a
 * reason. A template naming secrets a test never created still deploys, and
 * the Resource records what it was given instead.
 */
export class SimCfnSecretsManagerDynamicReferenceResolver implements SimCfnDynamicReferenceResolver {
  private readonly secretsManager: SimSecretsManager;

  private readonly secretsManagerIn: (
    scope: SimAwsAccountRegionScope,
  ) => SimSecretsManager;

  constructor(
    properties: SimCfnSecretsManagerDynamicReferenceResolverProperties,
  ) {
    this.secretsManager = properties.secretsManager;
    this.secretsManagerIn = properties.secretsManagerIn;
  }

  /**
   * Resolve one reference to the secret value it names.
   */
  async resolve(
    reference: SimCfnDynamicReference,
  ): Promise<SimCfnDynamicReferenceResolution> {
    let secretId = reference.body;

    try {
      const parsed = parseSimCfnSecretsManagerReference(reference.body);
      secretId = parsed.secretId;

      return { value: await this.read(parsed) };
    } catch (error) {
      if (error instanceof SimCfnSecretsManagerReferenceProblem) {
        return this.standIn(reference, secretId, error.message);
      }

      if (error instanceof SimSecretsManagerError) {
        return this.standIn(
          reference,
          secretId,
          `and simulated Secrets Manager could not read it: ${error.message}`,
        );
      }

      throw error;
    }
  }

  /**
   * Read the version the reference selects, or the current one.
   */
  private async read(
    reference: SimCfnSecretsManagerReference,
  ): Promise<string> {
    const { secretId, scope, jsonKey, versionStage, versionId } = reference;
    const secretsManager =
      scope === undefined ? this.secretsManager : this.secretsManagerIn(scope);

    const read = await secretsManager.getSecretValue({
      input: {
        SecretId: secretId,
        VersionStage: versionStage,
        VersionId: versionId,
      },
    });

    const secretString = read.SecretString;

    if (secretString === undefined) {
      throw new SimCfnSecretsManagerReferenceProblem(
        `and '${secretId}' holds a binary value, which a dynamic reference ` +
          `cannot read`,
      );
    }

    if (jsonKey === undefined) {
      return secretString;
    }

    return simCfnSecretsManagerJsonKeyValue(secretString, secretId, jsonKey);
  }

  /**
   * The value a reference Secrets Manager could not answer resolves to.
   *
   * The shape follows the `ssm` references beside it, and CDK before them,
   * which fills an unresolved context lookup with `dummy-value-for-<name>`. A
   * test reading one back sees where it came from.
   */
  private standIn(
    reference: SimCfnDynamicReference,
    secretId: string,
    reason: string,
  ): SimCfnDynamicReferenceResolution {
    return {
      value: `dummy-value-for-${secretId}`,
      reason:
        `holds ${reference.text}, ${reason}, so the Resource is created ` +
        `with a stand-in value`,
    };
  }
}
