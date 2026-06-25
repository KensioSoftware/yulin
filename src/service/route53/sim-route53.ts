import type {
  SimRoute53Record,
  SimRoute53RecordType,
} from "./record/sim-route53-record.js";
import type { SimAwsServiceTarget } from "../../serve/controller/sim-service-controller.js";
import { SimRoute53Zone } from "./zone/sim-route53-zone.js";
import { SimRoute53Resolver } from "./resolve/sim-route53-resolver.js";
import { normaliseSimRoute53Name } from "./local-name/sim-route53-local-name.js";

/**
 * Simulated Route53 service for Yulin-local name resolution.
 */
export class SimRoute53 {
  private readonly zone = new SimRoute53Zone();
  private readonly resolver = new SimRoute53Resolver({ zone: this.zone });

  /**
   * Create or replace a simulated Route53 record.
   */
  upsertRecord(record: SimRoute53Record): void {
    this.zone.upsertRecord(record);
  }

  /**
   * Get a simulated Route53 record by logical name and type.
   */
  record(
    name: string,
    type: SimRoute53RecordType,
  ): SimRoute53Record | undefined {
    return this.zone.record(normaliseSimRoute53Name(name), type);
  }

  /**
   * Resolve a Yulin-local HTTP hostname to a simulated AWS service target.
   */
  resolveHttpHost(hostname: string): SimAwsServiceTarget | undefined {
    return this.resolver.resolveHttpHost(hostname);
  }
}
