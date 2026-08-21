import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { PublishCommand } from "@aws-sdk/client-sns";
import { assertArrayLength, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";

import { recordingConsole } from "../../../test/serve/recording-console.js";
import { SimAws } from "../../service/aws/sim-aws.js";
import { serveSimAws } from "../http/local-server/sim-aws-local-server.js";

const phoneNumber = "+15550100";

/**
 * Text one code through a simulated SNS.
 */
async function textACode(simAws: SimAws): Promise<void> {
  await simAws
    .sns()
    .publish(
      new PublishCommand({ PhoneNumber: phoneNumber, Message: "code 12345" }),
    );
}

/**
 * Email one welcome message through a simulated SES.
 */
async function emailAWelcome(simAws: SimAws): Promise<void> {
  const ses = simAws.sesV2();

  ses.verifyIdentity("hello@example.com");
  ses.verifyIdentity("alice@example.com");

  await ses.sendEmail(
    new SendEmailCommand({
      FromEmailAddress: "hello@example.com",
      Destination: { ToAddresses: ["alice@example.com"] },
      Content: {
        Simple: {
          Subject: { Data: "Welcome" },
          Body: { Text: { Data: "Glad to have you here." } },
        },
      },
    }),
  );
}

describe("Message logging on a served simulated AWS environment", () => {
  it("prints messages without being asked to", async () => {
    // Given an environment served with nothing said about message logging.
    const simAws = new SimAws();
    const messageConsole = recordingConsole();
    const srv = await serveSimAws({ simAws, port: 0, messageConsole });

    // When a code is texted.
    await textACode(simAws);
    await srv.close();

    // Then it reached the console, because a dev server is where these are
    // worth seeing and asking for them means knowing the option is there.
    assertArrayLength(messageConsole.lines, 1);
    assertStringIncludes(messageConsole.lines[0], "code 12345");
  });

  it("prints the email a simulated SES accepted", async () => {
    // Given an environment served with nothing said about message logging.
    const simAws = new SimAws();
    const messageConsole = recordingConsole();
    const srv = await serveSimAws({ simAws, port: 0, messageConsole });

    // When a welcome message is emailed.
    await emailAWelcome(simAws);
    await srv.close();

    // Then the summary and the text reached the console.
    assertArrayLength(messageConsole.lines, 1);
    assertStringIncludes(messageConsole.lines[0], "sim SES: hello@example.com");
    assertStringIncludes(messageConsole.lines[0], "Glad to have you here.");
  });

  it("prints nothing when the server was told not to", async () => {
    // Given an environment served with message logging turned off.
    const simAws = new SimAws();
    const messageConsole = recordingConsole();
    const srv = await serveSimAws({
      simAws,
      port: 0,
      messageLogging: false,
      messageConsole,
    });

    // When a code is texted.
    await textACode(simAws);
    await srv.close();

    // Then nothing was printed, and the SMS was recorded as it always is.
    assertArrayLength(messageConsole.lines, 0);
    assertArrayLength(simAws.sns().sentSmsMessages(), 1);
  });

  it("stops printing once the server closes", async () => {
    // Given a served environment that has been closed.
    const simAws = new SimAws();
    const messageConsole = recordingConsole();
    const srv = await serveSimAws({ simAws, port: 0, messageConsole });
    await srv.close();

    // When a code is texted afterwards.
    await textACode(simAws);

    // Then the console the server was printing to is left alone.
    assertArrayLength(messageConsole.lines, 0);
  });
});
