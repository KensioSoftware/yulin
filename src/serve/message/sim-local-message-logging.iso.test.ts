import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
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
 * Sign a user up and text a code, which is one message of each kind.
 */
async function sendBothKinds(simAws: SimAws): Promise<void> {
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
}

describe("Logging the messages a served environment records", () => {
  it("prints a pool message and a text message as they happen", async () => {
    // Given a simulated environment being served with message logging on.
    const simAws = new SimAws();
    const target = recordingConsole();
    const logging = new SimLocalMessageLogging({ simAws, target });
    logging.serving();

    // When a user signs itself up and a code is texted.
    await sendBothKinds(simAws);

    // Then both messages were printed, the verification code among them.
    assertArrayLength(target.lines, 2);
    assertStringIncludes(target.lines[0], "sim Cognito");
    assertStringIncludes(target.lines[0], "alice@example.com");
    assertStringIncludes(target.lines[1], "sim SNS");
    assertStringIncludes(target.lines[1], "code 12345");
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
    ["one kind turned off", { sns: false }, ["sim Cognito"]],
    ["the other turned off", { cognito: false }, ["sim SNS"]],
    ["both turned off", false, []],
    ["everything turned on", true, ["sim Cognito", "sim SNS"]],
  ])("prints what %s asks for", async (_, option, expected) => {
    // Given a served environment asked for those kinds of message.
    const simAws = new SimAws();
    const target = recordingConsole();
    new SimLocalMessageLogging({ simAws, option, target }).serving();

    // When a message of each kind is recorded.
    await sendBothKinds(simAws);

    // Then only the kinds asked for were printed, in that order.
    assertArrayLength(target.lines, expected.length);

    const printed = [...target.lines];

    for (const prefix of expected) {
      assertStringIncludes(String(printed.shift()), prefix);
    }
  });

  it("prints nothing once the server has stopped", async () => {
    // Given a served environment that has stopped serving.
    const simAws = new SimAws();
    const target = recordingConsole();
    const logging = new SimLocalMessageLogging({ simAws, target });
    logging.serving();
    logging.stopping();

    // When messages are recorded afterwards.
    await sendBothKinds(simAws);

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
