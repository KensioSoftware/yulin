import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";

/**
 * The ARN of one Cognito user pool, whose last segment is the pool's own id.
 *
 * The Account and the Region the ARN names are not read. A pool in another
 * Account is out of scope here, and the pool id already carries its Region, so
 * the id is the whole of what this simulation looks a pool up by.
 */
const userPoolArn =
  /^arn:aws:cognito-idp:[a-z0-9-]+:\d{12}:userpool\/(?<poolId>[a-z0-9-]+_[A-Za-z0-9]+)$/u;

/**
 * The user pools a `COGNITO_USER_POOLS` authorizer accepts tokens from.
 *
 * Real `CreateAuthorizer` takes them as ARNs and requires at least one, and a
 * token is admitted when any one of the pools issued it. The ARNs are kept as
 * they were written, because that is what `GetAuthorizer` hands back, and the
 * pool ids are what a token is verified against.
 */
export class SimRestApiUserPoolProviders {
  /**
   * The ARNs as they were written, which is what the API reports back.
   */
  public readonly arns: readonly string[];

  /**
   * The pool ids those ARNs name, in the order they were written.
   */
  public readonly userPoolIds: readonly string[];

  private constructor(arns: readonly string[], userPoolIds: readonly string[]) {
    this.arns = arns;
    this.userPoolIds = userPoolIds;
  }

  /**
   * Read the `providerARNs` an authorizer was created with, refusing a list
   * this simulation could not verify a token against.
   *
   * An authorizer naming no pool, or naming something that is not a user pool
   * ARN, refuses every request. That reads to a caller like a signing problem
   * rather than the configuration one it is, so it is refused when the
   * authorizer is created.
   */
  static parse(providerArns: readonly string[]): SimRestApiUserPoolProviders {
    if (providerArns.length === 0) {
      throw new SimApiGatewayBadRequest(
        "CreateAuthorizer with type COGNITO_USER_POOLS requires providerARNs " +
          "naming at least one user pool",
      );
    }

    return new SimRestApiUserPoolProviders(
      [...providerArns],
      providerArns.map((arn) => userPoolId(arn)),
    );
  }
}

/**
 * The pool an ARN names, refusing one that names no user pool.
 */
function userPoolId(arn: string): string {
  const poolId = userPoolArn.exec(arn)?.groups?.["poolId"];

  if (poolId === undefined) {
    throw new SimApiGatewayBadRequest(
      `providerARNs entry '${arn}' is not a user pool ARN, which is written ` +
        `as 'arn:aws:cognito-idp:<region>:<account>:userpool/<poolId>'`,
    );
  }

  return poolId;
}
