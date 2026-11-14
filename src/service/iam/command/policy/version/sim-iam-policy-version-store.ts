import type { BackgroundScheduler } from "../../../../../util/background/background.js";
import type { SimArn } from "../../../../aws/arn.js";
import type { SimIamActionAuthorizer } from "../../../authorize/sim-iam-action-authorizer.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import type {
  SimIamManagedPolicy,
  SimIamPolicyVersion,
} from "../../../policy/sim-iam-policy.js";
import { simIamPolicyVersions } from "../../../policy/sim-iam-policy-versions.js";
import type { SimIamCommand } from "../../entity/sim-iam-entity-policy.command.js";
import type { SimIamRequestOptions } from "../../sim-iam-request-options.js";
import { simIamDefined } from "../../sim-iam-found.js";
import { simIamRequired } from "../../sim-iam-required.js";

export interface SimIamPolicyVersionStoreProperties {
  readonly policies: Map<SimArn, SimIamManagedPolicy>;
  readonly authorizer: SimIamActionAuthorizer;
  readonly background: BackgroundScheduler;
}

/**
 * Finds the managed policy and version a version command names, and stores
 * the policy back once the command changes it.
 *
 * A stored policy is replaced whole, so the default version's document is
 * what the policy record carries for authorization to read.
 */
export class SimIamPolicyVersionStore {
  constructor(readonly properties: SimIamPolicyVersionStoreProperties) {}

  /**
   * Wait for the simulation's sequencing point. A command waits here first,
   * so authorizing, finding and changing its entity then run with nothing
   * in between.
   */
  async sequence(): Promise<void> {
    await this.properties.background.sequence();
  }

  /**
   * Make a version the default, the one authorization reads.
   */
  makeDefault(policy: SimIamManagedPolicy, version: SimIamPolicyVersion): void {
    this.save(policy, {
      defaultVersionId: version.versionId,
      policyDocument: version.document,
      versions: simIamPolicyVersions(policy),
    });
  }

  /**
   * Store the policy with changes, as updated now.
   */
  save(
    policy: SimIamManagedPolicy,
    changes: Partial<SimIamManagedPolicy>,
  ): SimIamManagedPolicy {
    const updated = {
      ...policy,
      ...changes,
      updateDate: this.properties.background.now(),
    };
    this.properties.policies.set(policy.arn, updated);

    return updated;
  }

  /**
   * Find one version of the policy.
   */
  version(
    policy: SimIamManagedPolicy,
    versionId: string | undefined,
  ): SimIamPolicyVersion {
    const required = simIamRequired(versionId, "versionId");
    return simIamDefined(
      simIamPolicyVersions(policy).find((each) => each.versionId === required),
      () =>
        new SimIamNoSuchEntity(
          `Policy ${policy.arn} version ${required} does not exist or is not attachable.`,
        ),
    );
  }

  /**
   * Authorize an action on the policy, and find it among the Account's own.
   */
  policy(
    action: string,
    command: SimIamCommand<{ readonly PolicyArn?: string | undefined }>,
    options: SimIamRequestOptions | undefined,
  ): SimIamManagedPolicy {
    const { authorizer, policies } = this.properties;
    const arn = simIamRequired(command.input.PolicyArn, "policyArn") as SimArn;
    authorizer.authorize(`iam:${action}`, arn, options?.caller);

    return simIamDefined(
      policies.get(arn),
      () =>
        new SimIamNoSuchEntity(
          `Policy ${arn} does not exist or is not attachable.`,
        ),
    );
  }
}
