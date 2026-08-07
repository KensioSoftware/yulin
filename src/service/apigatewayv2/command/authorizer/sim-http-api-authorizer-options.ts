import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";

/**
 * The value shapes an authorizer option arrives in.
 */
type SimHttpApiAuthorizerOption =
  | string
  | number
  | boolean
  | object
  | undefined;

/**
 * Refuses an option belonging to the other kind of authorizer.
 *
 * The two kinds are configured by different halves of one command input, and
 * API Gateway refuses an option written against the kind that has no use for
 * it. Accepting it here would make an authorizer look configured for something
 * nothing would apply.
 */
export class SimHttpApiAuthorizerOptions {
  private readonly authorizerType: string;

  constructor(authorizerType: string) {
    this.authorizerType = authorizerType;
  }

  /**
   * Refuse an option this kind of authorizer does not take.
   */
  refuse(
    option: string,
    value: SimHttpApiAuthorizerOption,
    reason: string,
  ): void {
    if (value === undefined) {
      return;
    }

    throw new SimApiGatewayV2BadRequest(
      `CreateAuthorizer ${option} is set on a ${this.authorizerType} ` +
        `authorizer, ${reason}`,
    );
  }
}
