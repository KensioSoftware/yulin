import type { SimCfnResource } from "../../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRoute53AliasTarget } from "../../../command/change-resource-record-sets/change-resource-record-sets.cmd.js";

/**
 * Parses AWS::Route53::RecordSet AliasTarget properties into sim Route53 shape.
 */
export class SimCfnRoute53AliasTargetParser {
  constructor(private readonly resource: SimCfnResource) {}

  /**
   * Parse and validate a CloudFormation AliasTarget value.
   */
  parse(aliasTarget: unknown): SimRoute53AliasTarget | undefined {
    if (aliasTarget === undefined) {
      return undefined;
    }

    if (
      aliasTarget === null ||
      typeof aliasTarget !== "object" ||
      Array.isArray(aliasTarget)
    ) {
      throw new TypeError(
        `Invalid AWS::Route53::RecordSet ${this.resource.logicalId}: AliasTarget must be an object`,
      );
    }

    return this.parseRecord(aliasTarget as SimCfnTemplateValueRecord);
  }

  private parseRecord(
    aliasTarget: SimCfnTemplateValueRecord,
  ): SimRoute53AliasTarget {
    const hostedZoneId = aliasTarget["HostedZoneId"];
    const dnsName = aliasTarget["DNSName"];
    const evaluateTargetHealth = aliasTarget["EvaluateTargetHealth"];

    this.validateHostedZoneId(hostedZoneId);
    this.validateDnsName(dnsName);
    this.validateEvaluateTargetHealth(evaluateTargetHealth);

    return {
      HostedZoneId: hostedZoneId,
      DNSName: dnsName,
      EvaluateTargetHealth: evaluateTargetHealth,
    };
  }

  private validateHostedZoneId(
    hostedZoneId: unknown,
  ): asserts hostedZoneId is string | undefined {
    if (hostedZoneId !== undefined && typeof hostedZoneId !== "string") {
      throw new TypeError(
        `Invalid AWS::Route53::RecordSet ${this.resource.logicalId}: AliasTarget.HostedZoneId must be a string`,
      );
    }
  }

  private validateDnsName(dnsName: unknown): asserts dnsName is string {
    if (typeof dnsName !== "string") {
      throw new TypeError(
        `Invalid AWS::Route53::RecordSet ${this.resource.logicalId}: AliasTarget.DNSName must be a string`,
      );
    }
  }

  private validateEvaluateTargetHealth(
    evaluateTargetHealth: unknown,
  ): asserts evaluateTargetHealth is boolean | undefined {
    if (
      evaluateTargetHealth !== undefined &&
      typeof evaluateTargetHealth !== "boolean"
    ) {
      throw new TypeError(
        `Invalid AWS::Route53::RecordSet ${this.resource.logicalId}: AliasTarget.EvaluateTargetHealth must be a boolean`,
      );
    }
  }
}
