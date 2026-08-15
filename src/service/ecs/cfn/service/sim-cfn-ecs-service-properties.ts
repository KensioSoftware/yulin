import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateServiceCommandInput } from "../../command/create-service/create-service.command.js";
import type { SimEcsServiceLoadBalancer } from "../../service/sim-ecs-service-detail.js";
import { SimCfnEcsPropertyReader } from "../property/sim-cfn-ecs-property-reader.js";
import { SimCfnEcsServiceName } from "./sim-cfn-ecs-service-name.js";
import { SimCfnEcsServicePropertyRules } from "./sim-cfn-ecs-service-property-rules.js";

/**
 * How many tasks a service that declares no count keeps running.
 *
 * Real CloudFormation documents one task for a new service that leaves
 * `DesiredCount` out, so a template that leaves it out gets a service that is
 * running rather than one scaled to nothing.
 */
const defaultDesiredCount = 1;

interface SimCfnEcsServicePropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::ECS::Service CloudFormation properties into CreateService input.
 *
 * Both of the things a service is made of arrive as strings that have already
 * been resolved: `Cluster` is a `Ref` to a cluster, which is its name, or an
 * ARN, and `TaskDefinition` is a `Ref` to a task definition, which is the ARN
 * of the revision the stack registered, or an ARN, or a family. Simulated ECS
 * takes each of those forms already, so both are passed on as they resolved
 * rather than being taken apart here.
 */
export class SimCfnEcsServiceProperties {
  private readonly resource: SimCfnResource;
  private readonly reader: SimCfnEcsPropertyReader;
  private readonly rules: SimCfnEcsServicePropertyRules;

  constructor(properties: SimCfnEcsServicePropertiesProperties) {
    this.resource = properties.resource;
    this.reader = new SimCfnEcsPropertyReader(properties);
    this.rules = new SimCfnEcsServicePropertyRules({
      properties: properties.properties,
      ignorer: properties.resource,
    });
  }

  /**
   * The CreateService input this Resource declares.
   */
  createServiceInput(): SimCreateServiceCommandInput {
    const reader = this.reader;

    return {
      cluster: reader.text("Cluster"),
      serviceName: this.serviceName(),
      taskDefinition: reader.text("TaskDefinition"),
      desiredCount: this.desiredCount(),
      launchType: reader.text("LaunchType"),
      schedulingStrategy: reader.text("SchedulingStrategy"),
      loadBalancers: reader.apiList<SimEcsServiceLoadBalancer>("LoadBalancers"),
    };
  }

  /**
   * The service name.
   *
   * An unnamed service is named after the stack and the logical ID, as real
   * CloudFormation names one, so a test can find the service the stack it
   * deployed created.
   */
  serviceName(): string {
    return (
      this.reader.text("ServiceName") ??
      new SimCfnEcsServiceName({
        stackName: this.resource.stackName,
        logicalId: this.resource.logicalId,
      }).value
    );
  }

  /**
   * How many tasks the service keeps running.
   */
  desiredCount(): number {
    return this.reader.wholeNumber("DesiredCount") ?? defaultDesiredCount;
  }

  /**
   * Record the properties the service is created without acting on.
   */
  recordIgnoredProperties(): void {
    this.rules.apply();
  }
}
