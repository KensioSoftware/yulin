import { describe, it } from "vitest";
import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import {
  SimSdkAlreadyInterceptedError,
  SimSdkCallbackNotSupportedError,
} from "./error/sim-sdk.error.js";
import { installSendPatch } from "./send-patch.js";

interface SendCapable {
  send(command: object, ...rest: unknown[]): Promise<unknown>;
}

class FakeClient implements SendCapable {
  send(): Promise<unknown> {
    return Promise.resolve("real send");
  }
}

function ownSendValue(target: object): unknown {
  return Object.getOwnPropertyDescriptor(target, "send")?.value;
}

describe("SDK client send patch", () => {
  it("routes send calls to the handler with the command and client", async () => {
    const client: SendCapable = new FakeClient();
    const seen: { command?: object; client?: unknown } = {};

    const patch = installSendPatch(client, (command, sendClient) => {
      seen.command = command;
      seen.client = sendClient;
      return Promise.resolve("simulated send");
    });

    const command = { input: {} };
    assertIdentical(await client.send(command), "simulated send");
    assertIdentical(seen.command, command);
    assertIdentical(seen.client, client);
    assertTrue(patch.isInstalled());
  });

  it("patches a client class prototype for all instances", async () => {
    class PrototypeClient implements SendCapable {
      send(): Promise<unknown> {
        return Promise.resolve("real send");
      }
    }
    const patch = installSendPatch(
      PrototypeClient.prototype,
      (_command, client) => Promise.resolve(client),
    );

    const clientA: SendCapable = new PrototypeClient();
    const clientB: SendCapable = new PrototypeClient();
    assertIdentical(await clientA.send({}), clientA);
    assertIdentical(await clientB.send({}), clientB);

    patch.restore();
    assertIdentical(await clientA.send({}), "real send");
  });

  it("restores the inherited send when the instance had no own send", async () => {
    const client: SendCapable = new FakeClient();

    const patch = installSendPatch(client, () => Promise.resolve("simulated"));
    assertTrue(Object.hasOwn(client, "send"));

    patch.restore();
    assertFalse(Object.hasOwn(client, "send"));
    assertFalse(patch.isInstalled());
    assertIdentical(await client.send({}), "real send");
  });

  it("restores a previous own send", async () => {
    const client: SendCapable = new FakeClient();
    const ownSend = (): Promise<unknown> => Promise.resolve("own send");
    client.send = ownSend;

    const patch = installSendPatch(client, () => Promise.resolve("simulated"));
    assertIdentical(await client.send({}), "simulated");

    patch.restore();
    assertIdentical(ownSendValue(client), ownSend);
    assertIdentical(await client.send({}), "own send");
  });

  it("does not clobber a send installed after the patch", () => {
    const client: SendCapable = new FakeClient();
    const patch = installSendPatch(client, () => Promise.resolve("simulated"));

    const laterSend = (): Promise<unknown> => Promise.resolve("later send");
    client.send = laterSend;

    assertFalse(patch.isInstalled());
    patch.restore();
    assertIdentical(ownSendValue(client), laterSend);
  });

  it("rejects patching a send that is already patched", () => {
    const client: SendCapable = new FakeClient();
    installSendPatch(client, () => Promise.resolve("simulated"));

    const error = assertThrowsError(() => {
      installSendPatch(client, () => Promise.resolve("simulated again"));
    });

    assertInstanceOf(error, SimSdkAlreadyInterceptedError);
    assertStringIncludes(error.message, "FakeClient");
  });

  it("names an unnameable patch target as target in the rejection", () => {
    const bare = Object.create(null) as object;
    installSendPatch(bare, () => Promise.resolve("simulated"));

    const error = assertThrowsError(() => {
      installSendPatch(bare, () => Promise.resolve("simulated again"));
    });

    assertStringIncludes(error.message, "SDK client target");
  });

  it("allows patching again after a restore", async () => {
    const client: SendCapable = new FakeClient();
    const first = installSendPatch(client, () => Promise.resolve("first"));
    first.restore();

    const second = installSendPatch(client, () => Promise.resolve("second"));

    assertTrue(second.isInstalled());
    assertIdentical(await client.send({}), "second");
  });

  it("rejects callback-style send calls", async () => {
    const client: SendCapable = new FakeClient();
    installSendPatch(client, () => Promise.resolve("simulated"));

    const error = await assertThrowsErrorAsync(async () => {
      await client.send({}, () => undefined);
    });

    assertInstanceOf(error, SimSdkCallbackNotSupportedError);
  });
});
