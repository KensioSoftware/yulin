import type { SimCfnResource } from "../../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimRoute53ResourceRecord,
  SimRoute53ResourceRecordSet,
} from "../../../command/change-resource-record-sets/change-resource-record-sets.cmd.js";
import type { SimRoute53RecordType } from "../../../record/sim-route53-record.js";
import { SimCfnRoute53AliasTargetParser } from "../parse/sim-cfn-r53-alias-target-parser.js";

/**
 * Builds Route53 ResourceRecordSet command input from CloudFormation
 * AWS::Route53::RecordSet properties.
 */
export class SimCfnRoute53RecordSetBuilder {
  constructor(
    private readonly resource: SimCfnResource,
    private readonly properties: SimCfnTemplateValueRecord,
  ) {}

  /**
   * Convert CloudFormation RecordSet properties into sim Route53 command shape.
   */
  build(): SimRoute53ResourceRecordSet {
    const name = this.name();
    const type = this.type();

    return {
      Name: name,
      Type: type,
      TTL: this.ttl(),
      ResourceRecords: this.resourceRecords(),
      AliasTarget: new SimCfnRoute53AliasTargetParser(this.resource).parse(
        this.properties["AliasTarget"],
      ),
    };
  }

  private name(): string {
    const name = this.properties["Name"];

    if (typeof name !== "string") {
      throw new TypeError(
        `Invalid AWS::Route53::RecordSet ${this.resource.logicalId}: Name must be a string`,
      );
    }

    return name;
  }

  private type(): SimRoute53RecordType {
    const type = this.properties["Type"];

    if (!this.isRoute53RecordType(type)) {
      throw new TypeError(
        `Invalid AWS::Route53::RecordSet ${this.resource.logicalId}: Type must be a supported Route53 record type`,
      );
    }

    return type;
  }

  private ttl(): number | undefined {
    const ttl = this.properties["TTL"];

    if (ttl === undefined) {
      return undefined;
    }

    if (typeof ttl !== "string" && typeof ttl !== "number") {
      throw new TypeError(
        `Invalid AWS::Route53::RecordSet ${this.resource.logicalId}: TTL must be a string or number`,
      );
    }

    if (typeof ttl === "string" && ttl.trim().length === 0) {
      throw new TypeError(
        `Invalid AWS::Route53::RecordSet ${this.resource.logicalId}: TTL must be a non-negative integer`,
      );
    }

    const parsedTtl = Number(ttl);

    if (!Number.isInteger(parsedTtl) || parsedTtl < 0) {
      throw new TypeError(
        `Invalid AWS::Route53::RecordSet ${this.resource.logicalId}: TTL must be a non-negative integer`,
      );
    }

    return parsedTtl;
  }

  private resourceRecords(): readonly SimRoute53ResourceRecord[] | undefined {
    const resourceRecords = this.properties["ResourceRecords"];

    if (resourceRecords === undefined) {
      return undefined;
    }

    if (!Array.isArray(resourceRecords)) {
      throw new TypeError(
        `Invalid AWS::Route53::RecordSet ${this.resource.logicalId}: ResourceRecords must be an array`,
      );
    }

    return resourceRecords.map((value) => this.resourceRecord(value));
  }

  private resourceRecord(value: unknown): SimRoute53ResourceRecord {
    if (typeof value !== "string") {
      throw new TypeError(
        `Invalid AWS::Route53::RecordSet ${this.resource.logicalId}: ResourceRecords values must be strings`,
      );
    }

    return {
      Value: value,
    };
  }

  private isRoute53RecordType(value: unknown): value is SimRoute53RecordType {
    return (
      value === "A" ||
      value === "AAAA" ||
      value === "CNAME" ||
      value === "TXT" ||
      value === "NS" ||
      value === "SOA"
    );
  }
}
