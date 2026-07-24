import type {
  SimCfnCfBinding,
  SimCfnExecutableResourceBinding,
} from "../../../cloudformation/bind/sim-cfn-exec-binding.type.js";
import { SimCfnExecBindingFinder } from "../../../cloudformation/bind/validate/sim-cfn-exec-binding-finder.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { CloudFrontFunction } from "../../index.js";

interface SimCfnCffBindingLookupProperties {
  readonly resource: SimCfnResource;
  readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
  readonly cffName: string;
}

/**
 * Find the executable binding targeting a CloudFront Function Resource,
 * resolving the identifiers a binding can target: the function name and the
 * simulator's CloudFront Function ARN, which has no region component.
 */
export function findSimCfnCffBinding(
  properties: SimCfnCffBindingLookupProperties,
): SimCfnCfBinding | undefined {
  const bindingFinder = new SimCfnExecBindingFinder<CloudFrontFunction.Handler>(
    {
      resource: properties.resource,
      bindings: properties.bindings,
    },
  );

  const { accountId } = properties.resource.accountRegionScope;

  return bindingFinder.findBinding({
    functionName: properties.cffName,
    arn: `arn:aws:cloudfront::${accountId}:function/${properties.cffName}`,
  });
}
