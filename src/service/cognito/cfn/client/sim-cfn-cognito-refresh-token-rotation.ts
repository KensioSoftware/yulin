import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoRefreshTokenRotationType } from "../../user-pool/client/sim-cognito-refresh-token-rotation.js";
import type { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";

/**
 * The `RefreshTokenRotation` fields, which are both of them.
 */
const modelledFields = ["Feature", "RetryGracePeriodSeconds"];

interface SimCfnCognitoRefreshTokenRotationProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnCognitoPropertyParser;
}

/**
 * Reads the `RefreshTokenRotation` property of an AWS::Cognito::UserPoolClient
 * Resource into the shape CreateUserPoolClient takes.
 *
 * What each field may be is left to the client, which is where the same
 * request from an SDK caller is checked.
 */
export class SimCfnCognitoRefreshTokenRotation {
  private readonly resource: SimCfnResource;
  private readonly propertyParser: SimCfnCognitoPropertyParser;

  constructor(properties: SimCfnCognitoRefreshTokenRotationProperties) {
    this.resource = properties.resource;
    this.propertyParser = properties.propertyParser;
  }

  /**
   * Whether the client rotates its refresh tokens, or undefined when the
   * template says nothing about it.
   */
  parse(
    value: SimCfnTemplateValue | undefined,
  ): SimCognitoRefreshTokenRotationType | undefined {
    const rotation = this.propertyParser.optionalRecord(
      this.resource,
      value,
      "RefreshTokenRotation",
    );

    if (rotation === undefined) {
      return undefined;
    }

    this.propertyParser.ignoreUnmodelledKeys(
      this.resource,
      rotation,
      modelledFields,
      "RefreshTokenRotation ",
    );

    return {
      Feature: this.propertyParser.optionalString(
        this.resource,
        rotation["Feature"],
        "RefreshTokenRotation Feature",
      ),
      RetryGracePeriodSeconds: this.propertyParser.optionalNumber(
        this.resource,
        rotation["RetryGracePeriodSeconds"],
        "RefreshTokenRotation RetryGracePeriodSeconds",
      ),
    };
  }
}
