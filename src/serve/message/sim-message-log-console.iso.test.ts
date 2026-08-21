import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { recordingConsole } from "../../../test/serve/recording-console.js";
import { SimMessageLogConsole } from "./sim-message-log-console.js";

describe("Printing the messages a served environment would have sent", () => {
  it("prints a pool email with its subject and its occasion", () => {
    // Given a console to print to.
    const target = recordingConsole();

    // When a user pool's verification email is printed.
    new SimMessageLogConsole(target).print({
      kind: "cognito",
      userPoolId: "us-east-1_AbCd1234",
      medium: "EMAIL",
      recipient: "alice@example.com",
      occasion: "SignUp",
      subject: "Verify your email",
      body: "Your verification code is 483920",
    });

    // Then the pool, the recipient and the occasion introduce the message, and
    // the subject and body follow indented under it.
    assertIdentical(
      target.lines[0],
      [
        "sim Cognito us-east-1_AbCd1234: email to alice@example.com (SignUp)",
        "  Subject: Verify your email",
        "  Your verification code is 483920",
      ].join("\n"),
    );
  });

  it("prints a pool text message without a subject line", () => {
    // Given a console to print to.
    const target = recordingConsole();

    // When a message with no subject is printed, as a text message has none.
    new SimMessageLogConsole(target).print({
      kind: "cognito",
      userPoolId: "us-east-1_AbCd1234",
      medium: "SMS",
      recipient: "+15550100",
      occasion: "Authentication",
      subject: undefined,
      body: "Your code is 118221",
    });

    // Then the body follows the first line with no empty subject in between.
    assertIdentical(
      target.lines[0],
      [
        "sim Cognito us-east-1_AbCd1234: SMS to +15550100 (Authentication)",
        "  Your code is 118221",
      ].join("\n"),
    );
  });

  it("indents every line of a message that runs to several", () => {
    // Given a console to print to.
    const target = recordingConsole();

    // When the body has line breaks in it.
    new SimMessageLogConsole(target).print({
      kind: "cognito",
      userPoolId: "us-east-1_AbCd1234",
      medium: "EMAIL",
      recipient: "alice@example.com",
      occasion: "ForgotPassword",
      subject: "Reset your password",
      body: "Someone asked to reset your password.\nYour code is 771043",
    });

    // Then the whole body is one indented block under the first line.
    assertIdentical(
      target.lines[0],
      [
        "sim Cognito us-east-1_AbCd1234: email to alice@example.com (ForgotPassword)",
        "  Subject: Reset your password",
        "  Someone asked to reset your password.",
        "  Your code is 771043",
      ].join("\n"),
    );
  });

  it("prints a text message with the number it went to", () => {
    // Given a console to print to.
    const target = recordingConsole();

    // When an SMS simulated SNS recorded is printed.
    new SimMessageLogConsole(target).print({
      kind: "sns",
      phoneNumber: "+15550100",
      message: "Your one-time code is 118221",
      suppressed: false,
    });

    // Then the number introduces it and the text follows indented.
    assertIdentical(
      target.lines[0],
      ["sim SNS: SMS to +15550100", "  Your one-time code is 118221"].join(
        "\n",
      ),
    );
  });

  it("says when the opt-out list stopped a text message", () => {
    // Given a console to print to.
    const target = recordingConsole();

    // When an SMS the opt-out list suppressed is printed.
    new SimMessageLogConsole(target).print({
      kind: "sns",
      phoneNumber: "+15550100",
      message: "Your one-time code is 118221",
      suppressed: true,
    });

    // Then the first line says nothing arrived, so a reader waiting for the
    // code knows why it never came.
    assertIdentical(
      target.lines[0],
      [
        "sim SNS: SMS to +15550100 (suppressed, number opted out)",
        "  Your one-time code is 118221",
      ].join("\n"),
    );
  });
});
