import type { CommandHandler } from "../../../../../command/command-handler.js";
import type { SimArn } from "../../../../aws/arn.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import type { SimIamManagedPolicy } from "../../../policy/sim-iam-policy.js";
import type {
  SimListPoliciesCommand,
  SimListPoliciesCommandOutput,
} from "./list-policies.command.js";

interface ListPoliciesCommandHandlerProperties {
  readonly policies: Map<SimArn, SimIamManagedPolicy>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM ListPoliciesCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/ListPoliciesCommand/
 */
export class ListPoliciesCommandHandler implements CommandHandler<
  SimListPoliciesCommand,
  SimListPoliciesCommandOutput
> {
  private readonly policies: Map<SimArn, SimIamManagedPolicy>;
  private readonly background: BackgroundScheduler;

  constructor(properties: ListPoliciesCommandHandlerProperties) {
    const { policies, background = new BackgroundTasks() } = properties;

    this.policies = policies;
    this.background = background;
  }

  /**
   * Handle a ListPoliciesCommand from the SDK.
   */
  async handle(
    command: SimListPoliciesCommand,
  ): Promise<SimListPoliciesCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const maxItems = command.input.MaxItems ?? 100;
    const policies = this.matchingPolicies(command);

    const startArn =
      command.input.Marker === undefined
        ? undefined
        : this.parseMarker(command.input.Marker);

    const startIndex =
      startArn === undefined
        ? 0
        : Math.max(
            0,
            policies.findIndex((policy) => policy.arn === startArn) + 1,
          );

    const page = policies.slice(startIndex, startIndex + maxItems);
    const lastPolicy = page.at(-1);
    const isTruncated = startIndex + page.length < policies.length;

    return {
      Policies: page.map((policy) => ({
        PolicyName: policy.policyName,
        PolicyId: policy.policyId,
        Arn: policy.arn,
        Path: policy.path,
        DefaultVersionId: policy.defaultVersionId,
        AttachmentCount: policy.attachmentCount,
        PermissionsBoundaryUsageCount: policy.permissionsBoundaryUsageCount,
        IsAttachable: policy.isAttachable,
        Description: policy.description,
        CreateDate: policy.createDate,
        UpdateDate: policy.updateDate,
      })),
      IsTruncated: isTruncated,
      Marker:
        isTruncated && lastPolicy !== undefined
          ? this.makeMarker(lastPolicy.arn)
          : undefined,
    };
  }

  private matchingPolicies(
    command: SimListPoliciesCommand,
  ): SimIamManagedPolicy[] {
    const policies = this.policies
      .values()
      .toArray()
      .toSorted((a, b) => a.arn.localeCompare(b.arn));

    return policies.filter((policy) => {
      if (command.input.Scope === "AWS") {
        return false;
      }

      if (command.input.OnlyAttached === true && policy.attachmentCount === 0) {
        return false;
      }

      if (
        command.input.PathPrefix !== undefined &&
        !policy.path.startsWith(command.input.PathPrefix)
      ) {
        return false;
      }

      return !(
        command.input.PolicyUsageFilter === "PermissionsBoundary" &&
        policy.permissionsBoundaryUsageCount === 0
      );
    });
  }

  private makeMarker(policyArn: SimArn): string {
    return Buffer.from(policyArn, "utf8").toString("base64url");
  }

  private parseMarker(marker: string): SimArn {
    return Buffer.from(marker, "base64url").toString("utf8") as SimArn;
  }
}
