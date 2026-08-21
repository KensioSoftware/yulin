import type {
  SimAwsLoggedMessage,
  SimCognitoLoggedMessage,
  SimSnsLoggedSms,
} from "../../service/aws/message/sim-aws-logged-message.js";

/**
 * The console a message is printed to, as much of it as printing needs.
 */
export interface SimMessageConsole {
  log: (line: string) => void;
}

/**
 * How far a message body is indented under the line that introduces it.
 */
const bodyIndent = "  ";

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

  constructor(target: SimMessageConsole = console) {
    this.console = target;
  }

  /**
   * Print one message.
   */
  print(message: SimAwsLoggedMessage): void {
    const block =
      message.kind === "cognito"
        ? this.cognitoBlock(message)
        : this.smsBlock(message);

    this.console.log(block.join("\n"));
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

/**
 * A body indented under the line introducing it, line by line, so a message
 * running to several lines stays one readable block.
 */
function indented(body: string): readonly string[] {
  return body.split("\n").map((line) => `${bodyIndent}${line}`);
}
