import { SimSsmValidationException } from "../../error/sim-ssm.error.js";
import { ssmTextDataType } from "../../parameter/sim-ssm-parameter-version.js";
import type { SimPutParameterCommandInput } from "./parameter.command.js";
import { standardTier } from "./sim-ssm-parameter-view.js";

/**
 * Refuses the PutParameter options this simulation does not model.
 *
 * Every one of these changes what the parameter does on real AWS, so ignoring
 * any of them would let a request succeed here and behave differently in a
 * deployment. An AllowedPattern that is quietly dropped is the clearest case:
 * the value it was meant to reject would be stored without complaint.
 */
export class SimSsmUnsimulatedPutOptions {
  /**
   * Refuse a request carrying an option this simulation cannot honour.
   */
  refuseIn(input: SimPutParameterCommandInput): void {
    this.refuseTier(input.Tier);
    this.refuseDataType(input.DataType);
    this.refuse("AllowedPattern", input.AllowedPattern, "value validation");
    this.refuse("Policies", input.Policies, "parameter policies");
    this.refuse("Tags", input.Tags, "parameter tags");
  }

  private refuseTier(tier: string | undefined): void {
    if (tier === undefined || tier === standardTier) {
      return;
    }

    throw new SimSsmValidationException(
      `Parameter Tier '${tier}' is not simulated: only the ${standardTier} ` +
        `tier is, so a parameter here holds at most 4KB and carries no ` +
        `policies`,
    );
  }

  private refuseDataType(dataType: string | undefined): void {
    if (dataType === undefined || dataType === ssmTextDataType) {
      return;
    }

    throw new SimSsmValidationException(
      `Parameter DataType '${dataType}' is not simulated: real Parameter ` +
        `Store validates such a value against another service, which this ` +
        `simulation cannot do. Only '${ssmTextDataType}' is supported.`,
    );
  }

  private refuse(option: string, value: unknown, feature: string): void {
    if (value === undefined) {
      return;
    }

    throw new SimSsmValidationException(
      `PutParameter ${option} is not simulated: ${feature} would be ignored ` +
        `here and applied on real AWS`,
    );
  }
}
