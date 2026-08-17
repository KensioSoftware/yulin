import type { BackgroundScheduler } from "../../util/background/background.js";
import type * as simSnsCommands from "./command/sim-sns-command.types.js";
import type { SimSnsCommands } from "./command/sim-sns-commands.js";
import type { SimSnsRequestOptions } from "./command/sim-sns-request-options.js";
import { SimSnsPhoneNumber } from "./sms/sim-sns-phone-number.js";
import type { SimSnsSentSmsMessage } from "./sms/sim-sns-sent-sms-message.js";

interface SimSnsSmsProperties {
  readonly commands: SimSnsCommands;
  readonly background: BackgroundScheduler;
}

/**
 * The SMS half of simulated SNS: publishing to a phone number, and the opt-out
 * list that decides whether the message would have arrived.
 *
 * `SimSns` extends this, so a caller reaches these on the one service object
 * alongside the topic operations. They are here because they are the operations
 * that touch no topic at all.
 */
export abstract class SimSnsSms {
  protected readonly commands: SimSnsCommands;
  protected readonly background: BackgroundScheduler;

  protected constructor(properties: SimSnsSmsProperties) {
    this.commands = properties.commands;
    this.background = properties.background;
  }

  /**
   * Every SMS this simulated SNS would have sent, oldest first.
   *
   * Delivery stops at the simulator boundary, and this record is the whole of
   * what an SMS is here. A message the opt-out list stopped is in the list
   * too, marked suppressed.
   *
   * This is the simulator's own accessor. Real SNS tells a publisher nothing
   * about what became of an SMS, and a test needs to know.
   */
  sentSmsMessages(): readonly SimSnsSentSmsMessage[] {
    return this.commands.sentSms.all;
  }

  /**
   * Stop sending SMS to a phone number, as a reply of STOP does on real SNS.
   *
   * Real SNS has no API for this, because the recipient does it from the
   * handset. Standing in for the handset is the simulator's job, the same way
   * verifying an SES identity is. `OptInPhoneNumber` reverses it.
   */
  optOutPhoneNumber(phoneNumber: string): void {
    this.commands.optOutList.optOut(SimSnsPhoneNumber.of(phoneNumber));
  }

  /**
   * Handle a Publish Command from the SDK.
   */
  async publish(
    command: simSnsCommands.SimPublishCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimPublishCommandOutput> {
    await this.background.sequence();
    return this.commands.publish.publish(command, options);
  }

  /**
   * Handle a PublishBatch Command from the SDK.
   */
  async publishBatch(
    command: simSnsCommands.SimPublishBatchCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimPublishBatchCommandOutput> {
    await this.background.sequence();
    return this.commands.publish.publishBatch(command, options);
  }

  /**
   * Handle a CheckIfPhoneNumberIsOptedOut Command from the SDK.
   */
  async checkIfPhoneNumberIsOptedOut(
    command: simSnsCommands.SimCheckIfPhoneNumberIsOptedOutCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimCheckIfPhoneNumberIsOptedOutCommandOutput> {
    await this.background.sequence();
    return this.commands.optOut.checkIfPhoneNumberIsOptedOut(command, options);
  }

  /**
   * Handle a ListPhoneNumbersOptedOut Command from the SDK.
   */
  async listPhoneNumbersOptedOut(
    command: simSnsCommands.SimListPhoneNumbersOptedOutCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimListPhoneNumbersOptedOutCommandOutput> {
    await this.background.sequence();
    return this.commands.optOut.listPhoneNumbersOptedOut(command, options);
  }

  /**
   * Handle an OptInPhoneNumber Command from the SDK.
   */
  async optInPhoneNumber(
    command: simSnsCommands.SimOptInPhoneNumberCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimOptInPhoneNumberCommandOutput> {
    await this.background.sequence();
    return this.commands.optOut.optInPhoneNumber(command, options);
  }
}
