import { SimApiGatewayBadRequest } from "../error/sim-api-gateway.error.js";

/**
 * Refuses the request inputs this simulation does not model.
 *
 * Every command here accepts a small set of the options its real counterpart
 * takes, and the refusal works from that accepted set rather than from a list
 * of everything AWS offers. An option nobody thought about is refused by
 * default instead of being silently dropped. A dropped option is the failure
 * mode worth avoiding, because the API would then look configured to the
 * request that sent it and unconfigured to everything else.
 */
export class SimApiGatewayUnsimulatedInput {
  private readonly operation: string;

  constructor(operation: string) {
    this.operation = operation;
  }

  /**
   * Refuse every supplied input that is not one of the accepted options.
   */
  refuseUnaccepted(input: object, accepted: readonly string[]): void {
    for (const [option, value] of Object.entries(input)) {
      if (value === undefined || accepted.includes(option)) {
        continue;
      }

      throw new SimApiGatewayBadRequest(
        `${this.operation} ${option} is not simulated: it would be ignored ` +
          `here and applied on real AWS`,
      );
    }
  }

  /**
   * Refuse an input set to anything but the one value this simulation models.
   */
  refuseUnless(
    option: string,
    value: string | undefined,
    simulated: string,
    feature: string,
  ): void {
    if (value === undefined || value === simulated) {
      return;
    }

    throw new SimApiGatewayBadRequest(
      `${this.operation} ${option} '${value}' is not simulated: ` +
        `${feature}. Only '${simulated}' is supported.`,
    );
  }

  /**
   * Refuse an input set to anything but the values this simulation models.
   */
  refuseUnlessOneOf(
    option: string,
    value: string,
    simulated: readonly string[],
    feature: string,
  ): void {
    if (simulated.includes(value)) {
      return;
    }

    throw new SimApiGatewayBadRequest(
      `${this.operation} ${option} '${value}' is not simulated: ` +
        `${feature}. Only ${simulated.map((one) => `'${one}'`).join(" and ")} ` +
        `are supported.`,
    );
  }

  /**
   * Refuse an option this simulation ignores, where it was asked for.
   */
  refuseEnabled(
    option: string,
    value: boolean | undefined,
    feature: string,
  ): void {
    if (value !== true) {
      return;
    }

    throw new SimApiGatewayBadRequest(
      `${this.operation} ${option} is not simulated: ${feature}`,
    );
  }

  /**
   * Refuse a paging request, since every list command answers in full.
   */
  refusePaging(input: {
    readonly limit?: number | undefined;
    readonly position?: string | undefined;
  }): void {
    if (input.limit === undefined && input.position === undefined) {
      return;
    }

    throw new SimApiGatewayBadRequest(
      `${this.operation} paging is not simulated: every result is returned ` +
        `in one page, so limit and position would be ignored here and ` +
        `applied on real AWS`,
    );
  }

  /**
   * Require an input the operation cannot proceed without.
   */
  require(option: string, value: string | undefined): string {
    if (value === undefined || value.length === 0) {
      throw new SimApiGatewayBadRequest(`${this.operation} requires ${option}`);
    }

    return value;
  }
}
