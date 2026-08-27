import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import { SimRoute53 } from "../sim-route53.js";
import { SimCfnRoute53HostedZoneCreator } from "./hosted-zone/sim-cfn-r53-zone-creator.js";
import { SimCfnRoute53RecordSetApplicator } from "./record-set/apply/sim-cfn-r53-record-set-applicator.js";
import { SimCfnRoute53KskCreator } from "./dnssec/sim-cfn-r53-ksk-creator.js";
import { SimCfnRoute53ZoneSigningCreator } from "./dnssec/sim-cfn-r53-zone-signing-creator.js";
import { SimCfnRoute53ResourceDeleter } from "./sim-cfn-route53-resource-deleter.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimRoute53CloudFormationResourceFactoryProperties {
  readonly route53?: SimRoute53 | undefined;
}

/**
 * CloudFormation Resource factory for simulated Route53 resources.
 */
export class SimRoute53CloudFormationResourceFactory implements SimCfnServiceResourceFactory {
  private readonly hostedZoneCreator: SimCfnRoute53HostedZoneCreator;
  private readonly recordSetCreator: SimCfnRoute53RecordSetApplicator;
  private readonly keySigningKeyCreator: SimCfnRoute53KskCreator;
  private readonly zoneSigningCreator: SimCfnRoute53ZoneSigningCreator;
  private readonly deleter: SimCfnRoute53ResourceDeleter;

  constructor(
    properties: SimRoute53CloudFormationResourceFactoryProperties = {},
  ) {
    const { route53 = new SimRoute53() } = properties;

    this.hostedZoneCreator = new SimCfnRoute53HostedZoneCreator({ route53 });
    this.recordSetCreator = new SimCfnRoute53RecordSetApplicator({ route53 });
    this.keySigningKeyCreator = new SimCfnRoute53KskCreator({ route53 });
    this.zoneSigningCreator = new SimCfnRoute53ZoneSigningCreator({ route53 });
    this.deleter = new SimCfnRoute53ResourceDeleter({
      route53,
      recordSetCreator: this.recordSetCreator,
      keySigningKeyCreator: this.keySigningKeyCreator,
      zoneSigningCreator: this.zoneSigningCreator,
    });
  }

  /**
   * Create a simulated Route53 resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;
    const options = simCfnResourceCallerOptions(context.caller);

    switch (resourceTypeName) {
      case "HostedZone": {
        return await this.hostedZoneCreator.create(
          resource,
          properties,
          options,
        );
      }
      case "RecordSet": {
        return await this.recordSetCreator.create(
          resource,
          properties,
          options,
        );
      }
      case "KeySigningKey": {
        return await this.keySigningKeyCreator.create(
          resource,
          properties,
          options,
        );
      }
      case "DNSSEC": {
        return await this.zoneSigningCreator.create(
          resource,
          properties,
          options,
        );
      }
      default: {
        throw new Error(
          `Unsupported sim Route53 CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }

  /**
   * Delete a simulated Route53 resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    await this.deleter.delete(
      resourceTypeName,
      resource,
      context.resolvedProperties ?? resource.properties,
      simCfnResourceCallerOptions(context.caller),
    );
  }
}
