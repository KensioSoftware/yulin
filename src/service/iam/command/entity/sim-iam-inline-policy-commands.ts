import { SimIamNoSuchEntity } from "../../error/sim-iam.error.js";
import type { SimIamPolicyHolder } from "../../policy/sim-iam-policy-holder.js";
import { SimIamPolicyDocumentValidator } from "../../validate/sim-iam-policy-document-validator.js";
import { simIamPage, type SimIamPageInput } from "../sim-iam-page.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import { simIamRequired } from "../sim-iam-required.js";
import type {
  SimIamEmptyOutput,
  SimIamGetInlinePolicyOutput,
  SimIamListInlinePoliciesOutput,
} from "./sim-iam-entity-policy.command.js";
import type { SimIamEntityLookup } from "./sim-iam-entity-lookup.js";
import { assertSimIamInlinePolicyQuota } from "./sim-iam-policy-holder-quota.js";

type Options = SimIamRequestOptions | undefined;

/**
 * The inline policy commands IAM serves alike for Roles, Users and groups,
 * such as `PutGroupPolicy`, `GetUserPolicy` and `ListRolePolicies`.
 */
export class SimIamInlinePolicyCommands {
  private readonly validator: SimIamPolicyDocumentValidator =
    new SimIamPolicyDocumentValidator();

  constructor(private readonly lookup: SimIamEntityLookup) {}

  /**
   * Create or replace one inline policy.
   */
  async put(
    name: string | undefined,
    input: {
      readonly PolicyName?: string | undefined;
      readonly PolicyDocument?: string | undefined;
    },
    options: Options,
  ): Promise<SimIamEmptyOutput> {
    const { kind } = this.lookup.properties;
    const holder = await this.lookup.authorized("Put", name, options);
    const policyName = simIamRequired(input.PolicyName, "policyName");
    const document = input.PolicyDocument;

    this.validator.validateRequired(document, {
      attachedTo: kind,
      name: holder.name,
      policyName,
    });
    assertSimIamInlinePolicyQuota(holder.entity, kind, holder.name, {
      policyName,
      document,
    });
    holder.entity.inlinePolicies.set(policyName, document);

    return {};
  }

  /**
   * Read one inline policy, with its document URL-encoded as IAM sends it.
   */
  async get(
    name: string | undefined,
    policyName: string | undefined,
    options: Options,
  ): Promise<SimIamGetInlinePolicyOutput> {
    const holder = await this.lookup.authorized("Get", name, options);
    const policy = this.inlinePolicy(holder.entity, policyName);

    return {
      [`${this.lookup.properties.kind}Name`]: holder.name,
      PolicyName: policy.policyName,
      PolicyDocument: encodeURIComponent(policy.document),
    };
  }

  /**
   * Remove one inline policy.
   */
  async delete(
    name: string | undefined,
    policyName: string | undefined,
    options: Options,
  ): Promise<SimIamEmptyOutput> {
    const holder = await this.lookup.authorized("Delete", name, options);
    const policy = this.inlinePolicy(holder.entity, policyName);
    holder.entity.inlinePolicies.delete(policy.policyName);

    return {};
  }

  /**
   * List the names of the entity's inline policies, in name order.
   */
  async list(
    name: string | undefined,
    input: SimIamPageInput,
    options: Options,
  ): Promise<SimIamListInlinePoliciesOutput> {
    const holder = await this.lookup.authorized("List", name, options);
    const names = holder.entity.inlinePolicies
      .keys()
      .toArray()
      .toSorted((a, b) => a.localeCompare(b));
    const { items, ...paging } = simIamPage(names, (each) => each, input);

    return { PolicyNames: items, ...paging };
  }

  private inlinePolicy(
    entity: SimIamPolicyHolder,
    policyName: string | undefined,
  ): { readonly policyName: string; readonly document: string } {
    const required = simIamRequired(policyName, "policyName");
    const document = entity.inlinePolicies.get(required);

    if (document === undefined) {
      const kind = this.lookup.properties.kind.toLowerCase();

      throw new SimIamNoSuchEntity(
        `The ${kind} policy with name ${required} cannot be found.`,
      );
    }

    return { policyName: required, document };
  }
}
