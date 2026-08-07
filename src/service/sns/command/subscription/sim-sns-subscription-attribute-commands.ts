import { SimSnsInvalidParameterException } from "../../error/sim-sns.error.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import type { SimSnsSubscriptionAccess } from "./sim-sns-subscription-access.js";
import type {
  SimGetSubscriptionAttributesCommand,
  SimGetSubscriptionAttributesCommandOutput,
  SimSetSubscriptionAttributesCommand,
  SimSetSubscriptionAttributesCommandOutput,
} from "./subscription.command.js";

interface SimSnsSubscriptionAttributeCommandsProperties {
  readonly access: SimSnsSubscriptionAccess;
}

/**
 * The commands that read and change the attributes of a subscription.
 */
export class SimSnsSubscriptionAttributeCommands {
  private readonly access: SimSnsSubscriptionAccess;

  constructor(properties: SimSnsSubscriptionAttributeCommandsProperties) {
    this.access = properties.access;
  }

  /**
   * Read every attribute of a subscription.
   *
   * The request names no attributes, so everything the subscription has comes
   * back. An attribute real SNS reports and this simulation does not hold is
   * left out rather than invented.
   */
  getSubscriptionAttributes(
    command: SimGetSubscriptionAttributesCommand,
    options?: SimSnsRequestOptions,
  ): SimGetSubscriptionAttributesCommandOutput {
    const subscription = this.access.requireByArn(
      "sns:GetSubscriptionAttributes",
      command.input.SubscriptionArn,
      options,
    );

    return { $metadata: {}, Attributes: subscription.reportedAttributes() };
  }

  /**
   * Change one attribute of a subscription.
   *
   * Real SNS sets one attribute per request rather than a map of them, which is
   * why the request carries a name and a value instead of an `Attributes`
   * object.
   */
  setSubscriptionAttributes(
    command: SimSetSubscriptionAttributesCommand,
    options?: SimSnsRequestOptions,
  ): SimSetSubscriptionAttributesCommandOutput {
    const subscription = this.access.requireByArn(
      "sns:SetSubscriptionAttributes",
      command.input.SubscriptionArn,
      options,
    );
    const name = command.input.AttributeName;

    if (name === undefined || name === "") {
      throw new SimSnsInvalidParameterException(
        "Invalid parameter: AttributeName is required",
      );
    }

    // An absent value is how SNS is told to clear an attribute, so it reaches
    // the subscription as an empty string rather than being left out of the
    // request. RawMessageDelivery has no empty value, so clearing that one is
    // refused by the attribute itself.
    subscription.applyAttributes({
      [name]: command.input.AttributeValue ?? "",
    });

    return { $metadata: {} };
  }
}
