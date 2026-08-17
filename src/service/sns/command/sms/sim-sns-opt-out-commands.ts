import type { SimSnsOptOutList } from "../../sms/sim-sns-opt-out-list.js";
import { SimSnsPhoneNumber } from "../../sms/sim-sns-phone-number.js";
import { SimSnsPage } from "../sim-sns-page.js";
import type { SimSnsRequestOptions } from "../sim-sns-request-options.js";
import type { SimSnsTopicAccess } from "../topic/sim-sns-topic-access.js";
import type {
  SimCheckIfPhoneNumberIsOptedOutCommand,
  SimCheckIfPhoneNumberIsOptedOutCommandOutput,
  SimListPhoneNumbersOptedOutCommand,
  SimListPhoneNumbersOptedOutCommandOutput,
  SimOptInPhoneNumberCommand,
  SimOptInPhoneNumberCommandOutput,
} from "./sms.command.js";

interface SimSnsOptOutCommandsProperties {
  readonly access: SimSnsTopicAccess;
  readonly optOutList: SimSnsOptOutList;
}

/**
 * The commands that read and unwind the phone number opt-out list.
 *
 * None of them names a topic, so each authorizes against `*` the way
 * `ListTopics` does. A policy naming a topic ARN allows none of them, here as
 * on AWS.
 *
 * There is no command for opting a number out. Real SNS puts a number on the
 * list when the recipient replies STOP, and `SimSns.optOutPhoneNumber` stands
 * in for the handset.
 */
export class SimSnsOptOutCommands {
  private readonly access: SimSnsTopicAccess;
  private readonly optOutList: SimSnsOptOutList;

  constructor(properties: SimSnsOptOutCommandsProperties) {
    this.access = properties.access;
    this.optOutList = properties.optOutList;
  }

  /**
   * Say whether a number is opted out of receiving SMS.
   */
  checkIfPhoneNumberIsOptedOut(
    command: SimCheckIfPhoneNumberIsOptedOutCommand,
    options?: SimSnsRequestOptions,
  ): SimCheckIfPhoneNumberIsOptedOutCommandOutput {
    this.access.authorizeAnyTopic("sns:CheckIfPhoneNumberIsOptedOut", options);

    const phoneNumber = SimSnsPhoneNumber.of(command.input.phoneNumber);

    return {
      $metadata: {},
      isOptedOut: this.optOutList.isOptedOut(phoneNumber),
    };
  }

  /**
   * List the opted-out numbers, in the order they were opted out.
   */
  listPhoneNumbersOptedOut(
    command: SimListPhoneNumbersOptedOutCommand,
    options?: SimSnsRequestOptions,
  ): SimListPhoneNumbersOptedOutCommandOutput {
    this.access.authorizeAnyTopic("sns:ListPhoneNumbersOptedOut", options);

    const page = new SimSnsPage(this.optOutList.all, command.input.nextToken);

    return {
      $metadata: {},
      phoneNumbers: page.items,
      ...(page.nextToken !== undefined && { nextToken: page.nextToken }),
    };
  }

  /**
   * Take a number back off the opt-out list.
   *
   * A number that was never on it succeeds and changes nothing, as it does on
   * real SNS.
   */
  optInPhoneNumber(
    command: SimOptInPhoneNumberCommand,
    options?: SimSnsRequestOptions,
  ): SimOptInPhoneNumberCommandOutput {
    this.access.authorizeAnyTopic("sns:OptInPhoneNumber", options);

    this.optOutList.optIn(SimSnsPhoneNumber.of(command.input.phoneNumber));

    return { $metadata: {} };
  }
}
