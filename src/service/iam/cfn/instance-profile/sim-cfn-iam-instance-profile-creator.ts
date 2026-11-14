import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimIamInstanceProfile,
  SimIamInstanceProfileName,
} from "../../instance-profile/sim-iam-instance-profile.js";
import type { SimIam } from "../../sim-iam.js";
import {
  simCfnIamNameList,
  simCfnIamOptionalString,
  type SimCfnIamPropertyInput,
} from "../sim-cfn-iam-property.js";

const resourceType = "AWS::IAM::InstanceProfile";

/**
 * The longest name IAM gives an instance profile.
 */
const maximumNameLength = 128;

/**
 * Creates simulated IAM instance profiles for AWS::IAM::InstanceProfile
 * Resources.
 */
export class SimCfnIamInstanceProfileCreator {
  constructor(private readonly iam: SimIam) {}

  /**
   * Create an instance profile and put the Role its template names in it.
   * IAM holds one Role in a profile, so a template naming more is refused
   * before anything is created.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimIamInstanceProfile> {
    const property = (label: string): SimCfnIamPropertyInput => ({
      resourceType,
      resource,
      // oxlint-disable-next-line security/detect-object-injection -- fixed property names.
      value: properties[label],
      label,
    });
    const InstanceProfileName =
      simCfnIamOptionalString(property("InstanceProfileName")) ??
      new SimCfnGeneratedResourceName({
        stackName: resource.stackName,
        logicalId: resource.logicalId,
        maximumLength: maximumNameLength,
      }).value;
    const Path = simCfnIamOptionalString(property("Path"));
    const roles = simCfnIamNameList(property("Roles"));

    if (roles.length > 1) {
      throw new TypeError(
        `Invalid ${resourceType} ${resource.logicalId}: Roles holds one Role at most`,
      );
    }

    await this.iam.createInstanceProfile(
      { input: { InstanceProfileName, Path } },
      options,
    );
    await Promise.all(
      roles.map(async (RoleName) =>
        this.iam.addRoleToInstanceProfile(
          { input: { InstanceProfileName, RoleName } },
          options,
        ),
      ),
    );

    const profile = this.iam.instanceProfiles.get(
      InstanceProfileName as SimIamInstanceProfileName,
    );
    assertDefined(profile, `Sim IAM instance profile ${InstanceProfileName}`);

    return profile;
  }
}
