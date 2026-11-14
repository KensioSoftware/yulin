import type { CommandHandler } from "../../../../../command/command-handler.js";
import type { SimArn } from "../../../../aws/arn.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import type { SimIamManagedPolicy } from "../../../policy/sim-iam-policy.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import { simIamPolicyVersions } from "../../../policy/sim-iam-policy-versions.js";
import { simIamManagedPolicyLookup } from "../../../policy/sim-iam-managed-policy-lookup.js";
import type {
  SimGetPolicyVersionCommand,
  SimGetPolicyVersionCommandOutput,
} from "./get-policy-version.command.js";

interface GetPolicyVersionCommandHandlerProperties {
  readonly policies: ReadonlyMap<SimArn, SimIamManagedPolicy>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM GetPolicyVersionCommand handler.
 *
 * Any version the policy holds can be read, the default or not. IAM returns
 * the document URL-encoded, and callers decode it with `decodeURIComponent`.
 *
 * An AWS-managed policy answers with the version the catalogue holds, which
 * is the version AWS published when the catalogue was last written.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/GetPolicyVersionCommand/
 */
export class GetPolicyVersionCommandHandler implements CommandHandler<
  SimGetPolicyVersionCommand,
  SimGetPolicyVersionCommandOutput
> {
  private readonly policies: ReadonlyMap<SimArn, SimIamManagedPolicy>;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetPolicyVersionCommandHandlerProperties) {
    const { policies, background = new BackgroundTasks() } = properties;

    this.policies = policies;
    this.background = background;
  }

  /**
   * Handle a GetPolicyVersionCommand from the SDK.
   */
  async handle(
    command: SimGetPolicyVersionCommand,
  ): Promise<SimGetPolicyVersionCommandOutput> {
    const { PolicyArn, VersionId } = command.input;

    if (PolicyArn === undefined || PolicyArn.length === 0) {
      throw new Error("PolicyArn is required");
    }

    if (VersionId === undefined || VersionId.length === 0) {
      throw new Error("VersionId is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const policy = simIamManagedPolicyLookup(
      this.policies,
      PolicyArn as SimArn,
    );

    const version =
      policy === undefined
        ? undefined
        : simIamPolicyVersions(policy).find(
            (each) => each.versionId === VersionId,
          );

    if (policy === undefined || version === undefined) {
      throw new SimIamNoSuchEntity(
        `Policy ${PolicyArn} version ${VersionId} does not exist or is not attachable.`,
      );
    }

    return {
      PolicyVersion: {
        Document:
          version.document === undefined
            ? undefined
            : encodeURIComponent(version.document),
        VersionId,
        IsDefaultVersion: VersionId === policy.defaultVersionId,
        CreateDate: version.createDate,
      },
    };
  }
}
