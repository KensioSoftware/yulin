import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  simCfnResourceCallerOptions,
  type SimCfnResourceCallerOptions,
} from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type {
  SimCfnDynamicReference,
  SimCfnDynamicReferenceResolution,
  SimCfnDynamicReferenceResolver,
} from "../../../cloudformation/template/dynamic/sim-cfn-dynamic-reference.type.js";
import { SimSecretsManagerError } from "../../error/sim-secrets-manager.error.js";
import type { SimSecretsManager } from "../../sim-secrets-manager.js";
import { simCfnSecretsManagerReferenceStandIn } from "./sim-cfn-secrets-manager-reference-stand-in.js";
import { simCfnSecretsManagerReferenceValue } from "./sim-cfn-secrets-manager-reference-value.js";
import {
  parseSimCfnSecretsManagerReference,
  SimCfnSecretsManagerReferenceProblem,
} from "./sim-cfn-secrets-manager-reference-body.js";

interface SimCfnSecretsManagerDynamicReferenceResolverProperties {
  /** Secrets Manager for the Account and Region the Stack deploys into. */
  readonly secretsManager: SimSecretsManager;

  /** Secrets Manager for another Account and Region, which a full ARN names. */
  readonly secretsManagerIn: (
    scope: SimAwsAccountRegionScope,
  ) => SimSecretsManager;

  /** The principal the deployment runs as, which the secret is read as. */
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Answers `{{resolve:secretsmanager:...}}` references from simulated Secrets
 * Manager.
 *
 * The secret is read as the principal the deployment names, at the point the
 * Resource holding the reference is created. A deployment naming none reads as
 * the Account root, which is Secrets Manager's own default. Real
 * CloudFormation makes no dependency out of a dynamic reference, so a secret
 * another Resource of the same Stack creates is only there in time if the
 * template says `DependsOn`.
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

  private readonly callerOptions: SimCfnResourceCallerOptions;

  constructor(
    properties: SimCfnSecretsManagerDynamicReferenceResolverProperties,
  ) {
    this.secretsManager = properties.secretsManager;
    this.secretsManagerIn = properties.secretsManagerIn;
    this.callerOptions = simCfnResourceCallerOptions(properties.caller);
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

      return {
        value: await simCfnSecretsManagerReferenceValue(
          this.secretsManagerFor(parsed.scope),
          parsed,
          this.callerOptions,
        ),
      };
    } catch (error) {
      if (error instanceof SimCfnSecretsManagerReferenceProblem) {
        return simCfnSecretsManagerReferenceStandIn(
          reference,
          secretId,
          error.message,
        );
      }

      /* v8 ignore next 3 -- defensive: only Secrets Manager reaches here */
      if (!(error instanceof SimSecretsManagerError)) {
        throw error;
      }

      return simCfnSecretsManagerReferenceStandIn(
        reference,
        secretId,
        `and simulated Secrets Manager could not read it (${error.message})`,
      );
    }
  }

  /**
   * The Secrets Manager a reference reads from: the Stack's own, or the one a
   * full secret ARN names.
   */
  private secretsManagerFor(
    scope: SimAwsAccountRegionScope | undefined,
  ): SimSecretsManager {
    return scope === undefined
      ? this.secretsManager
      : this.secretsManagerIn(scope);
  }
}
