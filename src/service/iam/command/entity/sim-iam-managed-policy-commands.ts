import type { SimArn } from "../../../aws/arn.js";
import { SimIamNoSuchEntity } from "../../error/sim-iam.error.js";
import { simIamAttachedPolicies } from "../../policy/sim-iam-managed-policy-lookup.js";
import { simIamPage, type SimIamPageInput } from "../sim-iam-page.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import { simIamRequired } from "../sim-iam-required.js";
import type {
  SimIamEmptyOutput,
  SimIamListAttachedPoliciesOutput,
} from "./sim-iam-entity-policy.command.js";
import type {
  SimIamEntityLookup,
  SimIamFoundEntity,
} from "./sim-iam-entity-lookup.js";
import { assertSimIamManagedPolicyQuota } from "./sim-iam-policy-holder-quota.js";

type Options = SimIamRequestOptions | undefined;

/**
 * The managed policy commands IAM serves alike for Roles, Users and groups,
 * such as `AttachGroupPolicy` and `DetachUserPolicy`.
 *
 * An attachment refers to the policy by ARN, as AttachRolePolicy does, so an
 * ARN naming no policy is held and grants nothing.
 */
export class SimIamManagedPolicyCommands {
  constructor(private readonly lookup: SimIamEntityLookup) {}

  /**
   * Attach one managed policy.
   */
  async attach(
    name: string | undefined,
    policyArn: string | undefined,
    options: Options,
  ): Promise<SimIamEmptyOutput> {
    await this.lookup.sequence();
    const { arn, holder } = this.attachment("Attach", name, {
      policyArn,
      options,
    });
    assertSimIamManagedPolicyQuota(
      holder.entity,
      this.lookup.properties.kind,
      arn,
    );
    holder.entity.attachedPolicyArns.add(arn);

    return {};
  }

  /**
   * Detach one managed policy.
   */
  async detach(
    name: string | undefined,
    policyArn: string | undefined,
    options: Options,
  ): Promise<SimIamEmptyOutput> {
    await this.lookup.sequence();
    const { arn, holder } = this.attachment("Detach", name, {
      policyArn,
      options,
    });

    if (!holder.entity.attachedPolicyArns.delete(arn)) {
      throw new SimIamNoSuchEntity(`Policy ${arn} was not found.`);
    }

    return {};
  }

  /**
   * List the managed policies attached to the entity.
   */
  async listAttached(
    name: string | undefined,
    input: SimIamPageInput & { readonly PathPrefix?: string | undefined },
    options: Options,
  ): Promise<SimIamListAttachedPoliciesOutput> {
    await this.lookup.sequence();
    const holder = this.lookup.authorized("ListAttached", name, options);
    const attached = simIamAttachedPolicies(
      holder.entity.attachedPolicyArns,
      input.PathPrefix,
    );
    const { items, ...paging } = simIamPage(
      attached,
      (policy) => policy.PolicyArn,
      input,
    );

    return { AttachedPolicies: items, ...paging };
  }

  /**
   * Authorize attaching or detaching a policy, which IAM tests as
   * `iam:PolicyARN`.
   */
  private attachment(
    action: string,
    name: string | undefined,
    request: {
      readonly policyArn: string | undefined;
      readonly options: Options;
    },
  ): { readonly arn: SimArn; readonly holder: SimIamFoundEntity } {
    const arn = simIamRequired(request.policyArn, "policyArn") as SimArn;
    const holder = this.lookup.authorized(action, name, request.options, {
      "iam:PolicyARN": arn,
    });

    return { arn, holder };
  }
}
