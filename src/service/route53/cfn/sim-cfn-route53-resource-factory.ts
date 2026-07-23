import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { SimRoute53 } from "../sim-route53.js";
import { SimCfnRoute53HostedZoneCreator } from "./hosted-zone/sim-cfn-r53-zone-creator.js";
import { SimCfnRoute53RecordSetApplicator } from "./record-set/apply/sim-cfn-r53-record-set-applicator.js";

interface SimRoute53CloudFormationResourceFactoryProperties {
  readonly route53?: SimRoute53 | undefined;
}

/**
 * CloudFormation Resource factory for simulated Route53 resources.
 */
export class SimRoute53CloudFormationResourceFactory implements SimCfnServiceResourceFactory {
  private readonly hostedZoneCreator: SimCfnRoute53HostedZoneCreator;
  private readonly recordSetCreator: SimCfnRoute53RecordSetApplicator;

  constructor(
    properties: SimRoute53CloudFormationResourceFactoryProperties = {},
  ) {
    const { route53 = new SimRoute53() } = properties;

    this.hostedZoneCreator = new SimCfnRoute53HostedZoneCreator({ route53 });
    this.recordSetCreator = new SimCfnRoute53RecordSetApplicator({ route53 });
  }

  /**
   * Create a simulated Route53 resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    switch (resourceTypeName) {
      case "HostedZone": {
        return await this.hostedZoneCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      case "RecordSet": {
        return await this.recordSetCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      default: {
        throw new Error(
          `Unsupported sim Route53 CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }
}
