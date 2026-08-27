import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimElbV2LoadBalancer } from "../../load-balancer/sim-elbv2-load-balancer.js";
import type { SimElbV2 } from "../../sim-elbv2.js";
import type { SimElbV2Stores } from "../../sim-elbv2-stores.js";
import { SimCfnElbV2LoadBalancerProperties } from "./sim-cfn-elbv2-load-balancer-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnElbV2LoadBalancerCreatorProperties {
  readonly elbV2: SimElbV2;
  readonly stores: SimElbV2Stores;
}

/**
 * Creates simulated load balancers from
 * AWS::ElasticLoadBalancingV2::LoadBalancer Resources.
 *
 * The load balancer is created through the ordinary CreateLoadBalancer command
 * rather than constructed directly, so one a template deployed is the same
 * thing an SDK caller would have got: the same name rules, the same refusal of
 * a network load balancer, and the same DNS name.
 */
export class SimCfnElbV2LoadBalancerCreator {
  private readonly elbV2: SimElbV2;
  private readonly stores: SimElbV2Stores;

  constructor(properties: SimCfnElbV2LoadBalancerCreatorProperties) {
    this.elbV2 = properties.elbV2;
    this.stores = properties.stores;
  }

  /**
   * Create a load balancer from a LoadBalancer Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimElbV2LoadBalancer> {
    const declared = new SimCfnElbV2LoadBalancerProperties({
      resource,
      properties,
    });
    const input = declared.createLoadBalancerInput();

    declared.recordIgnoredProperties();

    await this.elbV2.createLoadBalancer({ input }, options);

    return this.stores.loadBalancers.requireByName(declared.name());
  }

  /**
   * Delete a load balancer created from a LoadBalancer Resource.
   *
   * Its listeners and rules come down with it, as they do on real ELB. The
   * teardown has already deleted them itself, since each of them names the
   * load balancer, so what this removes is usually the load balancer alone.
   */
  async delete(
    loadBalancer: SimElbV2LoadBalancer,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.elbV2.deleteLoadBalancer(
      { input: { LoadBalancerArn: loadBalancer.arn } },
      options,
    );
  }
}
