import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import type { SimCfnTemplate } from "../../template/sim-cfn-template.js";

interface MakeSimCfnStackResourceMapProps {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
  readonly template: SimCfnTemplate;
}

/**
 * Build simulated CloudFormation Stack resources from a template.
 */
export function makeSimCfnStackResourceMap(
  props: MakeSimCfnStackResourceMapProps,
): Map<string, SimCfnResource> {
  const { accountRegionScope, background, template } = props;
  const resources = new Map<string, SimCfnResource>();

  for (const resourceTemplate of template.resourceTemplates()) {
    resources.set(
      resourceTemplate.logicalId,
      new SimCfnResource({
        accountRegionScope,
        background,
        logicalId: resourceTemplate.logicalId,
        template: resourceTemplate.template,
      }),
    );
  }

  return resources;
}
