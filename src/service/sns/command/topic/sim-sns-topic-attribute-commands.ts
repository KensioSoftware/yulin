import { SimSnsInvalidParameterException } from "../../error/sim-sns.error.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import type { SimSnsTopicAccess } from "./sim-sns-topic-access.js";
import type {
  SimGetTopicAttributesCommand,
  SimGetTopicAttributesCommandOutput,
  SimSetTopicAttributesCommand,
  SimSetTopicAttributesCommandOutput,
} from "./topic.command.js";

interface SimSnsTopicAttributeCommandsProperties {
  readonly access: SimSnsTopicAccess;
}

/**
 * The commands that read and change what a topic is, rather than what goes
 * through it.
 */
export class SimSnsTopicAttributeCommands {
  private readonly access: SimSnsTopicAccess;

  constructor(properties: SimSnsTopicAttributeCommandsProperties) {
    this.access = properties.access;
  }

  /**
   * Read every attribute of a topic.
   *
   * A GetTopicAttributes request names no attributes, unlike the SQS command of
   * the same shape, so everything the topic has comes back. An attribute real
   * SNS reports and this simulation does not hold is left out rather than
   * invented.
   */
  getTopicAttributes(
    command: SimGetTopicAttributesCommand,
    options?: SimSnsRequestOptions,
  ): SimGetTopicAttributesCommandOutput {
    const topic = this.access.requireByArn(
      "sns:GetTopicAttributes",
      command.input.TopicArn,
      options,
    );

    return { $metadata: {}, Attributes: topic.reportedAttributes() };
  }

  /**
   * Change one attribute of a topic.
   *
   * Real SNS sets one attribute per request rather than a map of them, which is
   * why the request carries a name and a value instead of an `Attributes`
   * object.
   */
  setTopicAttributes(
    command: SimSetTopicAttributesCommand,
    options?: SimSnsRequestOptions,
  ): SimSetTopicAttributesCommandOutput {
    const topic = this.access.requireByArn(
      "sns:SetTopicAttributes",
      command.input.TopicArn,
      options,
    );
    const name = command.input.AttributeName;

    if (name === undefined || name === "") {
      throw new SimSnsInvalidParameterException(
        "Invalid parameter: AttributeName is required",
      );
    }

    // An absent value is how SNS is told to clear an attribute, so it reaches
    // the topic as an empty string rather than being left out of the request.
    topic.applyAttributes({ [name]: command.input.AttributeValue ?? "" });

    return { $metadata: {} };
  }
}
