import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRoute53HostedZone } from "../hosted-zone/sim-route53-hosted-zone.js";
import type { SimRoute53 } from "../sim-route53.js";
import { assertIsSimRoute53HostedZoneId } from "../command/create-hosted-zone/sim-route53-zone-id.js";

interface SimRoute53CloudFormationResourceFactoryProps {
  readonly route53: SimRoute53;
}

/**
 * CloudFormation Resource factory for simulated Route53 resources.
 */
export class SimRoute53CloudFormationResourceFactory implements SimCfnServiceResourceFactory {
  constructor(
    private readonly props: SimRoute53CloudFormationResourceFactoryProps,
  ) {}

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
        return await this.createHostedZone(
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

  private async createHostedZone(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimRoute53HostedZone> {
    const name = properties["Name"];

    if (typeof name !== "string") {
      throw new TypeError(
        `Invalid AWS::Route53::HostedZone ${resource.logicalId}: Name must be a string`,
      );
    }

    const hostedZoneConfig = properties["HostedZoneConfig"];

    if (
      hostedZoneConfig !== undefined &&
      hostedZoneConfig !== null &&
      (typeof hostedZoneConfig !== "object" || Array.isArray(hostedZoneConfig))
    ) {
      throw new Error(
        `Invalid AWS::Route53::HostedZone ${resource.logicalId}: HostedZoneConfig must be an object`,
      );
    }

    const route53HostedZoneConfig =
      hostedZoneConfig === undefined || hostedZoneConfig === null
        ? undefined
        : {
            Comment: this.hostedZoneConfigComment(resource, hostedZoneConfig),
            PrivateZone: this.hostedZoneConfigPrivateZone(
              resource,
              hostedZoneConfig,
            ),
          };

    const createOutput = await this.props.route53.createHostedZone({
      input: {
        Name: name,
        CallerReference: resource.logicalId,
        HostedZoneConfig: route53HostedZoneConfig,
      },
    });

    const hostedZoneId = createOutput.HostedZone?.Id;
    assertIsSimRoute53HostedZoneId(hostedZoneId);

    const hostedZone = this.props.route53.hostedZones.get(hostedZoneId);

    /* v8 ignore if -- defensive diagnostic */
    if (hostedZone === undefined) {
      throw new Error(
        `Expected sim Route53 Hosted Zone ${hostedZoneId} to exist after CloudFormation creation`,
      );
    }

    return hostedZone;
  }

  private hostedZoneConfigComment(
    resource: SimCfnResource,
    hostedZoneConfig: SimCfnTemplateValueRecord,
  ): string | undefined {
    const comment = hostedZoneConfig["Comment"];

    if (comment === undefined) {
      return undefined;
    }

    if (typeof comment !== "string") {
      throw new TypeError(
        `Invalid AWS::Route53::HostedZone ${resource.logicalId}: HostedZoneConfig.Comment must be a string`,
      );
    }

    return comment;
  }

  private hostedZoneConfigPrivateZone(
    resource: SimCfnResource,
    hostedZoneConfig: SimCfnTemplateValueRecord,
  ): boolean | undefined {
    const privateZone = hostedZoneConfig["PrivateZone"];

    if (privateZone === undefined) {
      return undefined;
    }

    if (typeof privateZone !== "boolean") {
      throw new TypeError(
        `Invalid AWS::Route53::HostedZone ${resource.logicalId}: HostedZoneConfig.PrivateZone must be a boolean`,
      );
    }

    return privateZone;
  }
}
