import { SimApiGatewayV2BadRequest } from "../error/sim-api-gateway-v2.error.js";

/**
 * Refuses the request inputs this simulation does not model.
 *
 * Every command here accepts a small set of the options its real counterpart
 * takes, so the refusal works from that accepted set rather than from a list
 * of everything AWS offers: an option nobody thought about is refused by
 * default instead of being silently dropped. A dropped option is the failure
 * mode worth avoiding, because the API would then look configured to the
 * request that sent it and unconfigured to everything else.
 */
export class SimApiGatewayV2UnsimulatedInput {
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

      throw new SimApiGatewayV2BadRequest(
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
    this.refuseUnlessOneOf(option, value, [simulated], feature);
  }

  /**
   * Refuse an input set to anything but the values this simulation models.
   */
  refuseUnlessOneOf(
    option: string,
    value: string | undefined,
    simulated: readonly string[],
    feature: string,
  ): void {
    if (value === undefined || simulated.includes(value)) {
      return;
    }

    const supported = this.supportedValues(simulated);

    throw new SimApiGatewayV2BadRequest(
      `${this.operation} ${option} '${value}' is not simulated: ` +
        `${feature}. ${supported}`,
    );
  }

  /**
   * Refuse a paging request, since every list command answers in full.
   */
  refusePaging(input: {
    readonly MaxResults?: string | undefined;
    readonly NextToken?: string | undefined;
  }): void {
    if (input.MaxResults === undefined && input.NextToken === undefined) {
      return;
    }

    throw new SimApiGatewayV2BadRequest(
      `${this.operation} paging is not simulated: every result is returned ` +
        `in one page, so MaxResults and NextToken would be ignored here and ` +
        `applied on real AWS`,
    );
  }

  /**
   * Require an input the operation cannot proceed without.
   */
  require(option: string, value: string | undefined): string {
    if (value === undefined || value.length === 0) {
      throw new SimApiGatewayV2BadRequest(
        `${this.operation} requires ${option}`,
      );
    }

    return value;
  }

  /**
   * How a refusal names what it would have accepted instead.
   */
  private supportedValues(simulated: readonly string[]): string {
    const quoted = simulated.map((one) => `'${one}'`).join(" and ");

    if (simulated.length > 1) {
      return `Only ${quoted} are supported.`;
    }

    return `Only ${quoted} is supported.`;
  }
}
