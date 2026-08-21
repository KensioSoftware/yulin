import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { recordingConsole } from "../../../test/serve/recording-console.js";
import type { SimSesLoggedEmail } from "../../service/aws/message/sim-aws-logged-message.js";
import { SimMessageLogConsole } from "./sim-message-log-console.js";

/**
 * A message with one recipient and a text part, which the tests below vary.
 */
const reset = {
  kind: "ses",
  fromEmailAddress: "hello@example.com",
  destination: {
    toAddresses: ["alice@example.com"],
    ccAddresses: [],
    bccAddresses: [],
  },
  subject: "Reset your password",
  text: "Follow this link to reset your password.",
  html: undefined,
  templateName: undefined,
  templateData: undefined,
} satisfies SimSesLoggedEmail;

describe("Printing an email a simulated SES accepted", () => {
  it("prints the sender, the recipients, the subject and the text", () => {
    // Given a console to print to.
    const target = recordingConsole();

    // When a message with all three recipient lists is printed.
    new SimMessageLogConsole({ target }).print({
      ...reset,
      destination: {
        toAddresses: ["alice@example.com"],
        ccAddresses: ["bob@example.com"],
        bccAddresses: ["audit@example.com"],
      },
    });

    // Then the sender and the three lists introduce it, and the subject and
    // the text follow indented under them.
    assertIdentical(
      target.lines[0],
      [
        "sim SES: hello@example.com to alice@example.com, cc bob@example.com, bcc audit@example.com",
        "  Subject: Reset your password",
        "  Text body:",
        "    Follow this link to reset your password.",
      ].join("\n"),
    );
  });

  it("leaves out a recipient list nobody was on", () => {
    // Given a console to print to.
    const target = recordingConsole();

    // When a message goes to a bcc recipient and nobody else.
    new SimMessageLogConsole({ target }).print({
      ...reset,
      destination: {
        toAddresses: [],
        ccAddresses: [],
        bccAddresses: ["audit@example.com"],
      },
    });

    // Then the empty lists are absent, and the one recipient reads as a bcc.
    assertIdentical(
      target.lines[0],
      [
        "sim SES: hello@example.com bcc audit@example.com",
        "  Subject: Reset your password",
        "  Text body:",
        "    Follow this link to reset your password.",
      ].join("\n"),
    );
  });

  it("reports an HTML part by its size", () => {
    // Given a console to print to, and a message whose only body is markup.
    const target = recordingConsole();
    const html = `<p>${"x".repeat(4084)}</p>`;

    // When it is printed.
    new SimMessageLogConsole({ target }).print({
      ...reset,
      text: undefined,
      html,
    });

    // Then the markup is measured and left out, since kilobytes of it would
    // bury everything else on the console.
    assertIdentical(
      target.lines[0],
      [
        "sim SES: hello@example.com to alice@example.com",
        "  Subject: Reset your password",
        "  HTML body: 4.1 kB, not printed",
      ].join("\n"),
    );
  });

  it("measures a small HTML part in bytes", () => {
    // Given a console to print to.
    const target = recordingConsole();

    // When a message carries a short HTML part.
    new SimMessageLogConsole({ target }).print({
      ...reset,
      text: undefined,
      html: "<p>Hi</p>",
    });

    // Then the size reads in the unit that fits it.
    assertIdentical(
      target.lines[0],
      [
        "sim SES: hello@example.com to alice@example.com",
        "  Subject: Reset your password",
        "  HTML body: 9 bytes, not printed",
      ].join("\n"),
    );
  });

  it("prints the template a message was rendered from, and its data", () => {
    // Given a console to print to.
    const target = recordingConsole();

    // When a templated send is printed.
    new SimMessageLogConsole({ target }).print({
      ...reset,
      templateName: "password-reset",
      templateData: { code: "483920" },
    });

    // Then the template name and the data it was filled from are both there.
    // That is what tells two sends of the same template apart.
    assertIdentical(
      target.lines[0],
      [
        "sim SES: hello@example.com to alice@example.com",
        "  Subject: Reset your password",
        '  Template: password-reset {"code":"483920"}',
        "  Text body:",
        "    Follow this link to reset your password.",
      ].join("\n"),
    );
  });

  it("cuts a long text body off and says how much was left out", () => {
    // Given a console printing at most twenty characters of text.
    const target = recordingConsole();

    // When a message with a longer text part is printed.
    new SimMessageLogConsole({ target, emailTextLimit: 20 }).print({
      ...reset,
      text: "0123456789012345678901234",
    });

    // Then the text stops at the limit and the rest is counted.
    assertIdentical(
      target.lines[0],
      [
        "sim SES: hello@example.com to alice@example.com",
        "  Subject: Reset your password",
        "  Text body:",
        "    01234567890123456789",
        "    ... 5 more characters, not printed",
      ].join("\n"),
    );
  });

  it("prints a text body that fits with nothing said about a cut", () => {
    // Given a console printing at most twenty characters of text.
    const target = recordingConsole();

    // When a message just inside the limit is printed.
    new SimMessageLogConsole({ target, emailTextLimit: 20 }).print({
      ...reset,
      text: "01234567890123456789",
    });

    // Then the whole text is there and nothing claims it was cut.
    assertIdentical(
      target.lines[0],
      [
        "sim SES: hello@example.com to alice@example.com",
        "  Subject: Reset your password",
        "  Text body:",
        "    01234567890123456789",
      ].join("\n"),
    );
  });

  it("indents every line of a text body that runs to several", () => {
    // Given a console to print to.
    const target = recordingConsole();

    // When the text has line breaks in it.
    new SimMessageLogConsole({ target }).print({
      ...reset,
      text: "Follow this link to reset your password.\nhttps://app.example.com/reset?token=abc123",
    });

    // Then the whole text is one indented block under its label.
    assertIdentical(
      target.lines[0],
      [
        "sim SES: hello@example.com to alice@example.com",
        "  Subject: Reset your password",
        "  Text body:",
        "    Follow this link to reset your password.",
        "    https://app.example.com/reset?token=abc123",
      ].join("\n"),
    );
  });
});
