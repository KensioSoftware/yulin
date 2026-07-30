import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import type { SimCfnTemplate } from "../../template/sim-cfn-template.js";

interface MakeSimCfnStackResourceMapProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
  readonly template: SimCfnTemplate;
}

/**
 * Build simulated CloudFormation Stack resources from a template.
 */
export function makeSimCfnStackResourceMap(
  properties: MakeSimCfnStackResourceMapProperties,
): Map<string, SimCfnResource> {
  const { accountRegionScope, background, template } = properties;
  const resources = new Map<string, SimCfnResource>();

  const resourceTemplates = template.resourceTemplates();
  const resourceLogicalIds = new Set(
    resourceTemplates.map((resourceTemplate) => resourceTemplate.logicalId),
  );

  for (const resourceTemplate of resourceTemplates) {
    resources.set(
      resourceTemplate.logicalId,
      new SimCfnResource({
        accountRegionScope,
        background,
        logicalId: resourceTemplate.logicalId,
        stackName: template.stackName,
        template: resourceTemplate.template,
        parameters: template.parameters,
        resourceLogicalIds,
      }),
    );
  }

  return resources;
}
