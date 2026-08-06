import type { SimCfnResource } from "../../../../cloudformation/resource/sim-cfn-resource.js";
import { isSimRoute53RecordType } from "../../../record/sim-route53-record-type.js";
import { simRoute53RecordTypes } from "../../../record/sim-route53-record.js";

/**
 * Skips template RecordSets declaring a record type sim Route53 does not store.
 *
 * Route53 has more record types than a simulator is going to model, and a zone
 * modelling a real one carries records that have nothing to do with what is
 * being tested. Failing the whole Stack over one of them leaves an otherwise
 * supported DNS stack undeployable until the record is edited out.
 *
 * The "Unsupported sim ... CloudFormation" wording marks the Resource as
 * skipped rather than failing the Stack, so the rest of the Stack deploys and
 * `stack.skippedResources` says which record type was left out.
 *
 * Only a declared type is skipped. A `Type` that is not a string at all says
 * nothing about which record was wanted, so that stays a refusal: an unmodelled
 * type is a gap in the simulation, a malformed one is a broken template.
 */
export class SimCfnRoute53RecordTypeSkip {
  /**
   * A skip error when this RecordSet declares a record type sim Route53 does
   * not store, otherwise undefined.
   */
  findSkipError(resource: SimCfnResource, type: unknown): Error | undefined {
    if (isSimRoute53RecordType(type) || !this.isDeclaredType(type)) {
      return undefined;
    }

    return new Error(
      `Unsupported sim Route53 CloudFormation Resource ${resource.logicalId}: ` +
        `sim Route53 does not model the ${type} record type, and stores ` +
        `${simRoute53RecordTypes.join(", ")}.`,
    );
  }

  private isDeclaredType(type: unknown): type is string {
    return typeof type === "string" && type.trim().length > 0;
  }
}
