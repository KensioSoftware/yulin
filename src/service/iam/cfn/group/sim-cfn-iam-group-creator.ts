import { assertDefined } from "../../../../util/type-guard/defined.js";

import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimIamGroup,
  SimIamGroupName,
} from "../../group/sim-iam-group.js";
import type { SimIam } from "../../sim-iam.js";
import { simCfnIamPrincipalGeneratedName } from "../name/sim-cfn-iam-generated-name.js";
import { SimCfnIamPoliciesParser } from "../sim-cfn-iam-policies-parser.js";
import { simCfnIamOptionalString } from "../sim-cfn-iam-property.js";

const resourceType = "AWS::IAM::Group";

/**
 * Creates simulated IAM groups for AWS::IAM::Group Resources.
 */
export class SimCfnIamGroupCreator {
  private readonly policiesParser = new SimCfnIamPoliciesParser({
    resourceType,
  });

  constructor(private readonly iam: SimIam) {}

  /**
   * Create a group, with the inline and managed policies its template gives.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimIamGroup> {
    const string = (label: string): string | undefined =>
      simCfnIamOptionalString({
        resourceType,
        resource,
        // oxlint-disable-next-line security/detect-object-injection -- fixed property names.
        value: properties[label],
        label,
      });
    const GroupName =
      string("GroupName") ?? simCfnIamPrincipalGeneratedName(resource);
    const inlinePolicies = this.policiesParser.inlinePolicies(
      resource,
      properties,
    );
    const managedPolicyArns = this.policiesParser.managedPolicyArns(
      resource,
      properties,
    );

    await this.iam.createGroup(
      { input: { GroupName, Path: string("Path") } },
      options,
    );
    await Promise.all([
      ...inlinePolicies.map(async ({ policyName, policyDocument }) =>
        this.iam.putGroupPolicy(
          {
            input: {
              GroupName,
              PolicyName: policyName,
              PolicyDocument: policyDocument,
            },
          },
          options,
        ),
      ),
      ...managedPolicyArns.map(async (PolicyArn) =>
        this.iam.attachGroupPolicy(
          { input: { GroupName, PolicyArn } },
          options,
        ),
      ),
    ]);

    const group = this.iam.groups.get(GroupName as SimIamGroupName);
    assertDefined(group, `Sim IAM group ${GroupName} after creation`);

    return group;
  }
}
