import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { PublishCommand } from "@aws-sdk/client-sns";
import {
  assertArrayLength,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { recordingConsole } from "../../../test/serve/recording-console.js";
import { SimAws } from "../../service/aws/sim-aws.js";
import { SimLocalMessageLogging } from "./sim-local-message-logging.js";
import type { SimMessageLoggingOption } from "./sim-message-logging.js";

const phoneNumber = "+15550100";

/**
 * A pool a user can sign itself up to, with the email address verified.
 */
async function signUpPool(
  simAws: SimAws,
): Promise<{ userPoolId: string; clientId: string }> {
  const cognito = simAws.cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      AutoVerifiedAttributes: ["email"],
    }),
  );
  assertNonNullable(created.UserPool?.Id);

  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: created.UserPool.Id,
      ClientName: "web",
    }),
  );
  assertNonNullable(client.UserPoolClient?.ClientId);

  return {
    userPoolId: created.UserPool.Id,
    clientId: client.UserPoolClient.ClientId,
  };
}

/**
 * Send one welcome message through a simulated SES.
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

/**
 * Sign a user up, text a code and email a welcome, which is one message of
 * each kind.
 */
async function sendEachKind(simAws: SimAws): Promise<void> {
  const { clientId } = await signUpPool(simAws);

  await simAws.cognitoIdentityProvider().signUp(
    new SignUpCommand({
      ClientId: clientId,
      Username: "alice",
      Password: "Sup3rSecret!",
      UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
    }),
  );
  await simAws
    .sns()
    .publish(
      new PublishCommand({ PhoneNumber: phoneNumber, Message: "code 12345" }),
    );
  await emailAWelcome(simAws);
}

describe("Logging the messages a served environment records", () => {
  it("prints a message of each kind as it happens", async () => {
    // Given a simulated environment being served with message logging on.
    const simAws = new SimAws();
    const target = recordingConsole();
    const logging = new SimLocalMessageLogging({ simAws, target });
    logging.serving();

    // When a user signs itself up, a code is texted and a welcome is emailed.
    await sendEachKind(simAws);

    // Then all three were printed, the verification code among them.
    assertArrayLength(target.lines, 3);
    assertStringIncludes(target.lines[0], "sim Cognito");
    assertStringIncludes(target.lines[0], "alice@example.com");
    assertStringIncludes(target.lines[1], "sim SNS");
    assertStringIncludes(target.lines[1], "code 12345");
    assertStringIncludes(target.lines[2], "sim SES");
    assertStringIncludes(target.lines[2], "Glad to have you here.");
  });

  it("prints the confirmation code the pool recorded", async () => {
    // Given a simulated environment being served with message logging on.
    const simAws = new SimAws();
    const target = recordingConsole();
    new SimLocalMessageLogging({ simAws, target }).serving();

    // When a user signs itself up.
    const { userPoolId, clientId } = await signUpPool(simAws);
    await simAws.cognitoIdentityProvider().signUp(
      new SignUpCommand({
        ClientId: clientId,
        Username: "alice",
        Password: "Sup3rSecret!",
        UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
      }),
    );

    // Then the code in the printed message is the one the pool recorded, which
    // is the whole point of printing it.
    const [recorded] = simAws
      .cognitoIdentityProvider()
      .userPool(userPoolId)
      .sentMessages();

    assertNonNullable(recorded);
    assertStringIncludes(target.lines[0], recorded.body);
  });

  it("says when the opt-out list stopped a text message", async () => {
    // Given a served environment, and a number that has opted out.
    const simAws = new SimAws();
    const target = recordingConsole();
    new SimLocalMessageLogging({ simAws, target }).serving();
    simAws.sns().optOutPhoneNumber(phoneNumber);

    // When a code is published to it.
    await simAws
      .sns()
      .publish(
        new PublishCommand({ PhoneNumber: phoneNumber, Message: "code 12345" }),
      );

    // Then the line says nothing arrived.
    assertStringIncludes(target.lines[0], "suppressed");
  });

  it.each<[string, SimMessageLoggingOption, readonly string[]]>([
    ["one kind turned off", { sns: false }, ["sim Cognito", "sim SES"]],
    ["another turned off", { cognito: false }, ["sim SNS", "sim SES"]],
    ["the email turned off", { ses: false }, ["sim Cognito", "sim SNS"]],
    ["all of them turned off", false, []],
    ["everything turned on", true, ["sim Cognito", "sim SNS", "sim SES"]],
  ])("prints what %s asks for", async (_, option, expected) => {
    // Given a served environment asked for those kinds of message.
    const simAws = new SimAws();
    const target = recordingConsole();
    new SimLocalMessageLogging({ simAws, option, target }).serving();

    // When a message of each kind is recorded.
    await sendEachKind(simAws);

    // Then only the kinds asked for were printed, in that order.
    assertArrayLength(target.lines, expected.length);

    const printed = [...target.lines];

    for (const prefix of expected) {
      assertStringIncludes(String(printed.shift()), prefix);
    }
  });

  it("prints as much of an email as the limit it was given", async () => {
    // Given a served environment printing ten characters of email text.
    const simAws = new SimAws();
    const target = recordingConsole();

    new SimLocalMessageLogging({
      simAws,
      option: { emailTextLimit: 10 },
      target,
    }).serving();

    // When a longer message is emailed.
    await emailAWelcome(simAws);

    // Then the text stopped at the limit and the rest was counted.
    assertStringIncludes(target.lines[0], "    Glad to ha");
    assertStringIncludes(
      target.lines[0],
      "... 12 more characters, not printed",
    );
  });

  it("prints nothing once the server has stopped", async () => {
    // Given a served environment that has stopped serving.
    const simAws = new SimAws();
    const target = recordingConsole();
    const logging = new SimLocalMessageLogging({ simAws, target });
    logging.serving();
    logging.stopping();

    // When messages are recorded afterwards.
    await sendEachKind(simAws);

    // Then nothing reached the console.
    assertArrayLength(target.lines, 0);
  });

  it("leaves the messages recorded before it started unprinted", async () => {
    // Given an environment that has already recorded a text message.
    const simAws = new SimAws();
    const target = recordingConsole();
    await simAws
      .sns()
      .publish(
        new PublishCommand({ PhoneNumber: phoneNumber, Message: "code 12345" }),
      );

    // When it starts being served.
    new SimLocalMessageLogging({ simAws, target }).serving();

    // Then the console has the messages from here on and no replay of the
    // ones before, which the service's own record already holds.
    assertArrayLength(target.lines, 0);
    assertArrayLength(simAws.sns().sentSmsMessages(), 1);
  });
});
