import type {
  SimAwsLoggedMessage,
  SimCognitoLoggedMessage,
  SimSnsLoggedSms,
} from "../../service/aws/message/sim-aws-logged-message.js";
import { SimEmailLogBlock } from "./sim-email-log-block.js";
import { bodyIndent, indented } from "./sim-message-indent.js";

/**
 * The console a message is printed to, as much of it as printing needs.
 */
export interface SimMessageConsole {
  log: (line: string) => void;
}

interface SimMessageLogConsoleProperties {
  /**
   * Where the lines go. The process console unless a test wants to read them.
   */
  readonly target?: SimMessageConsole | undefined;

  /**
   * How much of an email's text body is printed. See `SimEmailLogBlock`.
   */
  readonly emailTextLimit?: number | undefined;
}

/**
 * Prints the messages a served environment would have sent.
 *
 * One block per message: a first line saying which service sent it and where
 * it went, then the body indented under it. The body is what a reader is
 * after, since the confirmation code is in it, and the first line is what
 * tells two sign-ups apart.
 *
 * It goes to the console because the simulator has no logger of its own, the
 * same as every warning it raises.
 */
export class SimMessageLogConsole {
  private readonly console: SimMessageConsole;
  private readonly email: SimEmailLogBlock;

  constructor(properties: SimMessageLogConsoleProperties = {}) {
    this.console = properties.target ?? console;
    this.email = new SimEmailLogBlock({
      emailTextLimit: properties.emailTextLimit,
    });
  }

  /**
   * Print one message.
   */
  print(message: SimAwsLoggedMessage): void {
    this.console.log(this.block(message).join("\n"));
  }

  /**
   * The lines one message prints as.
   */
  private block(message: SimAwsLoggedMessage): readonly string[] {
    switch (message.kind) {
      case "cognito": {
        return this.cognitoBlock(message);
      }
      case "sns": {
        return this.smsBlock(message);
      }
      case "ses": {
        return this.email.lines(message);
      }
    }
  }

  /**
   * A pool message, with its subject where the medium has one.
   *
   * The occasion is on the first line because a pool sends the same wording on
   * more than one of them, and a code that arrived from a resend looks exactly
   * like the one from the sign-up otherwise.
   */
  private cognitoBlock(message: SimCognitoLoggedMessage): readonly string[] {
    const medium = message.medium === "EMAIL" ? "email" : "SMS";
    const lines = [
      `sim Cognito ${message.userPoolId}: ${medium} to ${message.recipient} (${message.occasion})`,
    ];

    if (message.subject !== undefined) {
      lines.push(`${bodyIndent}Subject: ${message.subject}`);
    }

    return [...lines, ...indented(message.body)];
  }

  /**
   * One text message, marked where the opt-out list stopped it.
   *
   * A suppressed message is printed like any other. The publish succeeded and
   * nothing arrived, and a reader waiting for a code that will never come
   * needs to be told which of the two happened.
   */
  private smsBlock(message: SimSnsLoggedSms): readonly string[] {
    const suppression = message.suppressed
      ? " (suppressed, number opted out)"
      : "";

    return [
      `sim SNS: SMS to ${message.phoneNumber}${suppression}`,
      ...indented(message.message),
    ];
  }
}
