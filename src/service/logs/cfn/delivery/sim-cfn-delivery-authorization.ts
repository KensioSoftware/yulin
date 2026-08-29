import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimLogsAuthorizer } from "../../command/authorize/sim-logs-authorizer.js";
import {
  simLogsAnyDeliveryArn,
  simLogsDeliveryDestinationArn,
  simLogsDeliverySourceArn,
} from "../../delivery/sim-logs-delivery-arn.js";

interface SimCfnDeliveryAuthorizationProperties {
  readonly authorizer: SimLogsAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The permissions a CloudFormation delivery Resource handler checks on top of
 * the API call it makes.
 *
 * Each of the three handlers reads its own resource back by name, with
 * `GetDeliverySource`, `GetDeliveryDestination` or `GetDelivery`. The read
 * comes before the write, and an execution Role denied it is refused before the
 * resource exists. The three `Describe` listings belong to the SDK operations
 * of those names, and no handler goes near one. A policy written from a real
 * CloudFormation refusal therefore grants the `Get` action, and that policy has
 * to deploy here.
 *
 * The checks sit together because they are the whole of what a deployment's
 * caller meets before the delivery commands take over.
 */
export class SimCfnDeliveryAuthorization {
  readonly #authorizer: SimLogsAuthorizer;
  readonly #scope: SimAwsAccountRegionScope;

  constructor(properties: SimCfnDeliveryAuthorizationProperties) {
    this.#authorizer = properties.authorizer;
    this.#scope = properties.accountRegionScope;
  }

  /**
   * Authorize creating an AWS::Logs::DeliverySource.
   *
   * The source need not be there. CloudFormation reads the name it is about to
   * take, and IAM decides the request before CloudWatch Logs answers it.
   */
  authorizeDeliverySourceCreate(name: string, caller?: SimAwsCaller): void {
    this.#authorizer.authorizeResource(
      "logs:GetDeliverySource",
      simLogsDeliverySourceArn(this.#scope, name),
      caller,
    );
  }

  /**
   * Authorize creating an AWS::Logs::DeliveryDestination.
   */
  authorizeDeliveryDestinationCreate(
    name: string,
    caller?: SimAwsCaller,
  ): void {
    this.#authorizer.authorizeResource(
      "logs:GetDeliveryDestination",
      simLogsDeliveryDestinationArn(this.#scope, name),
      caller,
    );
  }

  /**
   * Authorize creating an AWS::Logs::Delivery.
   *
   * A delivery carries an identifier CloudWatch Logs has yet to issue. The read
   * is authorized against every delivery in the scope, the way `CreateDelivery`
   * itself is.
   */
  authorizeDeliveryCreate(caller?: SimAwsCaller): void {
    this.#authorizer.authorizeResource(
      "logs:GetDelivery",
      simLogsAnyDeliveryArn(this.#scope),
      caller,
    );
  }
}
