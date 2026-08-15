import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimEcsService } from "../../service/sim-ecs-service.js";
import type { SimEcs } from "../../sim-ecs.js";
import { SimCfnEcsServiceProperties } from "./sim-cfn-ecs-service-properties.js";

interface SimCfnEcsServiceCreatorProperties {
  readonly ecs: SimEcs;
}

/**
 * Creates simulated services from AWS::ECS::Service Resources.
 *
 * The service is created through the ordinary CreateService command rather
 * than constructed directly, so a service a template deployed is the same
 * thing an SDK caller would have got: the same cluster and revision lookups,
 * the same refusal for a name the cluster already holds, and the same tasks
 * started for the desired count.
 *
 * The handlers a deployment bound to the task definition's containers are
 * already held by then, because the service names the task definition and is
 * therefore created after it, so a bound container of the service is running
 * once the stack has deployed.
 */
export class SimCfnEcsServiceCreator {
  private readonly ecs: SimEcs;

  constructor(properties: SimCfnEcsServiceCreatorProperties) {
    this.ecs = properties.ecs;
  }

  /**
   * Create a service from an AWS::ECS::Service Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimEcsService> {
    const serviceProperties = new SimCfnEcsServiceProperties({
      resource,
      properties,
    });
    const input = serviceProperties.createServiceInput();

    serviceProperties.recordIgnoredProperties();

    const created = await this.ecs.createService({ input });
    const serviceArn = created.service?.serviceArn;

    assertDefined(
      serviceArn,
      `sim ECS service ARN for CloudFormation Resource ${resource.logicalId}`,
    );

    return this.ecs.service(serviceArn);
  }

  /**
   * Delete a service created from an AWS::ECS::Service Resource.
   *
   * The deletion is forced, since a service is deleted here while it is still
   * keeping its tasks running. Real CloudFormation scales the service to zero
   * on its way out rather than deleting a running one, and the two come to the
   * same thing: the tasks stop, and the service is left `INACTIVE` rather than
   * removed, so something holding its ARN can still find out what became of it.
   */
  async delete(service: SimEcsService): Promise<void> {
    await this.ecs.deleteService({
      input: {
        cluster: service.clusterName,
        service: service.serviceName,
        force: true,
      },
    });
  }
}
