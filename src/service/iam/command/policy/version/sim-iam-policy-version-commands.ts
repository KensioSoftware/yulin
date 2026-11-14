import {
  SimIamDeleteConflict,
  SimIamLimitExceeded,
} from "../../../error/sim-iam.error.js";
import type { SimIamPolicyVersion } from "../../../policy/sim-iam-policy.js";
import {
  maxSimIamPolicyVersions,
  simIamLatestPolicyVersionNumber,
  simIamPolicyVersions,
} from "../../../policy/sim-iam-policy-versions.js";
import { SimIamPolicyDocumentValidator } from "../../../validate/sim-iam-policy-document-validator.js";
import { assertSimIamManagedPolicyWithinSizeLimit } from "../../../validate/size/sim-iam-policy-document-size.js";
import { simIamRefuseWhen } from "../../sim-iam-found.js";
import type { SimIamEmptyOutput } from "../../entity/sim-iam-entity-policy.command.js";
import { simIamPage } from "../../sim-iam-page.js";
import type { SimIamRequestOptions } from "../../sim-iam-request-options.js";
import type {
  SimCreatePolicyVersionCommand,
  SimCreatePolicyVersionCommandOutput,
  SimListPolicyVersionsCommand,
  SimListPolicyVersionsCommandOutput,
  SimPolicyVersionCommand,
} from "./sim-iam-policy-version.command.js";
import type { SimIamPolicyVersionStore } from "./sim-iam-policy-version-store.js";

/**
 * The commands that add, list, remove and choose between the versions of a
 * customer managed policy.
 *
 * The default version is the one authorization reads. Setting a different
 * default changes what every Role, User and group the policy is attached to
 * is allowed, from the next request on.
 */
export class SimIamPolicyVersionCommands {
  private readonly validator: SimIamPolicyDocumentValidator =
    new SimIamPolicyDocumentValidator();

  constructor(private readonly store: SimIamPolicyVersionStore) {}

  /**
   * Add a version, and make it the default where the command asks.
   */
  async createPolicyVersion(
    command: SimCreatePolicyVersionCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreatePolicyVersionCommandOutput> {
    const document = command.input.PolicyDocument;
    const policy = await this.store.policy(
      "CreatePolicyVersion",
      command,
      options,
    );
    assertSimIamManagedPolicyWithinSizeLimit(document);
    this.validator.validateRequired(document);

    const versions = simIamPolicyVersions(policy);

    simIamRefuseWhen(
      versions.length >= maxSimIamPolicyVersions,
      () =>
        new SimIamLimitExceeded(
          `A managed policy can have up to ${String(maxSimIamPolicyVersions)} ` +
            "versions. Before you create a new version, you must delete an " +
            "existing version.",
        ),
    );

    const number = simIamLatestPolicyVersionNumber(policy) + 1;
    const version: SimIamPolicyVersion = {
      versionId: `v${String(number)}`,
      document,
      createDate: this.store.properties.background.now(),
    };
    const updated = this.store.save(policy, {
      versions: [...versions, version],
      latestVersionNumber: number,
    });
    const isDefault = command.input.SetAsDefault === true;

    if (isDefault) {
      this.store.makeDefault(updated, version);
    }

    return {
      PolicyVersion: {
        VersionId: version.versionId,
        IsDefaultVersion: isDefault,
        CreateDate: version.createDate,
      },
    };
  }

  /**
   * List a policy's versions, newest first.
   */
  async listPolicyVersions(
    command: SimListPolicyVersionsCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListPolicyVersionsCommandOutput> {
    const policy = await this.store.policy(
      "ListPolicyVersions",
      command,
      options,
    );
    const { items, ...paging } = simIamPage(
      simIamPolicyVersions(policy).toReversed(),
      (version) => version.versionId,
      command.input,
    );

    return {
      Versions: items.map((version) => ({
        VersionId: version.versionId,
        IsDefaultVersion: version.versionId === policy.defaultVersionId,
        CreateDate: version.createDate,
      })),
      ...paging,
    };
  }

  /**
   * Remove a version other than the default.
   */
  async deletePolicyVersion(
    command: SimPolicyVersionCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    const policy = await this.store.policy(
      "DeletePolicyVersion",
      command,
      options,
    );
    const version = this.store.version(policy, command.input.VersionId);

    simIamRefuseWhen(
      version.versionId === policy.defaultVersionId,
      () =>
        new SimIamDeleteConflict(
          "Cannot delete the default version of a policy.",
        ),
    );

    this.store.save(policy, {
      versions: simIamPolicyVersions(policy).filter((each) => each !== version),
      latestVersionNumber: simIamLatestPolicyVersionNumber(policy),
    });

    return {};
  }

  /**
   * Make an existing version the one authorization reads.
   */
  async setDefaultPolicyVersion(
    command: SimPolicyVersionCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    const policy = await this.store.policy(
      "SetDefaultPolicyVersion",
      command,
      options,
    );
    this.store.makeDefault(
      policy,
      this.store.version(policy, command.input.VersionId),
    );

    return {};
  }
}
