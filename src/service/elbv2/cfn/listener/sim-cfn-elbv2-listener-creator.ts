import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimElbV2Listener } from "../../listener/sim-elbv2-listener.js";
import type { SimElbV2 } from "../../sim-elbv2.js";
import type { SimElbV2Stores } from "../../sim-elbv2-stores.js";
import { SimCfnElbV2ListenerProperties } from "./sim-cfn-elbv2-listener-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnElbV2ListenerCreatorProperties {
  readonly elbV2: SimElbV2;
  readonly stores: SimElbV2Stores;
}

/**
 * Creates simulated listeners from AWS::ElasticLoadBalancingV2::Listener
 * Resources.
 *
 * A declared `Certificates` list goes through CreateListener, so a certificate
 * an AWS::CertificateManager::Certificate in the same stack created is
 * resolved against simulated ACM the same way an SDK caller's is: one that was
 * never issued, or that belongs to another Account or Region, fails the
 * deployment rather than leaving a listener that could not serve.
 */
export class SimCfnElbV2ListenerCreator {
  private readonly elbV2: SimElbV2;
  private readonly stores: SimElbV2Stores;

  constructor(properties: SimCfnElbV2ListenerCreatorProperties) {
    this.elbV2 = properties.elbV2;
    this.stores = properties.stores;
  }

  /**
   * Create a listener from a Listener Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimElbV2Listener> {
    const declared = new SimCfnElbV2ListenerProperties({
      resource,
      properties,
    });
    const input = declared.createListenerInput();

    declared.recordIgnoredProperties();

    const created = await this.elbV2.createListener({ input }, options);
    const listenerArn = created.Listeners?.[0]?.ListenerArn;

    assertDefined(
      listenerArn,
      `sim ELBv2 listener ARN after CloudFormation creation for ${
        resource.logicalId
      }`,
    );

    return this.stores.listeners.requireByArn(listenerArn);
  }

  /**
   * Delete a listener created from a Listener Resource.
   *
   * Its rules come down with it, as they do on real ELB.
   */
  async delete(
    listener: SimElbV2Listener,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.elbV2.deleteListener(
      { input: { ListenerArn: listener.arn } },
      options,
    );
  }
}
