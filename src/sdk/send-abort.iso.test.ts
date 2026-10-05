import { describe, it } from "vitest";
import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { SimSdkAbortError } from "./error/sim-sdk.error.js";
import { installSendPatch } from "./send-patch.js";

describe("SDK client send abort signal", () => {
  interface SendCapable {
    send(command: object, ...rest: unknown[]): Promise<unknown>;
  }

  class FakeClient implements SendCapable {
    send(): Promise<unknown> {
      return Promise.resolve("real send");
    }
  }

  /**
   * A signal in the older Smithy shape, which has `onabort` and no event
   * listener methods.
   */
  interface OnAbortSignal {
    aborted: boolean;
    onabort: (() => void) | null;
  }

  /**
   * A client whose simulated send waits until released, recording that it
   * started and the promise of the operation it ran.
   */
  function clientWithPendingSend(): {
    readonly client: SendCapable;
    readonly started: Promise<unknown>;
    readonly release: () => void;
    readonly operation: () => Promise<unknown> | undefined;
  } {
    const client: SendCapable = new FakeClient();
    const started = Promise.withResolvers();
    const released = Promise.withResolvers();
    let operation: Promise<unknown> | undefined;
    installSendPatch(client, () => {
      started.resolve(undefined);
      operation = (async () => {
        await released.promise;
        return "answered late";
      })();
      return operation;
    });

    return {
      client,
      started: started.promise,
      release: () => {
        released.resolve(undefined);
      },
      operation: () => operation,
    };
  }

  it("rejects a send whose signal has already fired without running it", async () => {
    // Given a client whose simulated send records that it ran.
    const client: SendCapable = new FakeClient();
    let ran = false;
    installSendPatch(client, () => {
      ran = true;
      return Promise.resolve("simulated");
    });

    // When it is sent with a signal that has already fired.
    const signal = AbortSignal.abort();
    const error = await assertThrowsErrorAsync(async () => {
      await client.send({}, { abortSignal: signal });
    });

    // Then the send rejects as the SDK's HTTP handler does, before the
    // simulation sees it.
    assertInstanceOf(error, SimSdkAbortError);
    assertIdentical(error.name, "AbortError");
    assertIdentical(error.message, "Request aborted");
    assertIdentical(error.cause, signal.reason);
    assertFalse(ran, "the simulated send never ran");
  });

  it("aborts a send whose zero millisecond timeout was set before it", async () => {
    // Given a client with a simulated send that answers at once.
    const client: SendCapable = new FakeClient();
    installSendPatch(client, () => Promise.resolve("simulated"));

    // When it is sent with a timeout signal allowing it no time.
    const error = await assertThrowsErrorAsync(async () => {
      await client.send({}, { abortSignal: AbortSignal.timeout(0) });
    });

    // Then the timeout fires before the request would have gone out, and is
    // the cause of the abort.
    assertIdentical(error.name, "AbortError");
    assertInstanceOf(error.cause, Error);
    assertIdentical(error.cause.name, "TimeoutError");
  });

  it("uses an abort reason that is not an Error as the message", async () => {
    // Given a client with a simulated send.
    const client: SendCapable = new FakeClient();
    installSendPatch(client, () => Promise.resolve("simulated"));

    // When it is sent with a signal aborted for a reason given as a string.
    const error = await assertThrowsErrorAsync(async () => {
      await client.send({}, { abortSignal: AbortSignal.abort("user left") });
    });

    // Then the reason is the message, and there is no cause.
    assertIdentical(error.name, "AbortError");
    assertIdentical(error.message, "user left");
    assertUndefined(error.cause);
  });

  it("reports a request aborted where the signal gives no reason", async () => {
    // Given a client with a simulated send.
    const client: SendCapable = new FakeClient();
    installSendPatch(client, () => Promise.resolve("simulated"));

    // When it is sent with an older Smithy signal that has fired.
    const signal: OnAbortSignal = { aborted: true, onabort: null };
    const error = await assertThrowsErrorAsync(async () => {
      await client.send({}, { abortSignal: signal });
    });

    // Then the send rejects with the SDK's default abort message.
    assertIdentical(error.name, "AbortError");
    assertIdentical(error.message, "Request aborted");
  });

  it("rejects a pending send when its signal fires, leaving the operation running", async () => {
    // Given a send whose simulated operation is still pending.
    const { client, started, release, operation } = clientWithPendingSend();
    const controller = new AbortController();
    const sending = client.send({}, { abortSignal: controller.signal });
    await started;

    // When its signal fires.
    controller.abort();

    // Then the send rejects, and the operation it started still finishes.
    const error = await assertThrowsErrorAsync(async () => {
      await sending;
    });
    assertIdentical(error.name, "AbortError");
    release();
    assertIdentical(await operation(), "answered late");
  });

  it("listens through onabort on a signal without event listener methods", async () => {
    // Given a send carrying an older Smithy signal, whose operation is pending.
    const { client, started } = clientWithPendingSend();
    const signal: OnAbortSignal = { aborted: false, onabort: null };
    const sending = client.send({}, { abortSignal: signal });
    await started;

    // When the signal fires.
    signal.aborted = true;
    signal.onabort?.();

    // Then the send rejects, and the signal's handler slot is left as it was.
    const error = await assertThrowsErrorAsync(async () => {
      await sending;
    });
    assertIdentical(error.name, "AbortError");
    assertIdentical(signal.onabort, null);
  });

  it("answers a send whose signal never fires", async () => {
    // Given a client with a simulated send.
    const client: SendCapable = new FakeClient();
    installSendPatch(client, () => Promise.resolve("simulated"));

    // When it is sent with a signal that fires only after the answer.
    const controller = new AbortController();
    const answer = await client.send({}, { abortSignal: controller.signal });
    controller.abort();

    // Then the send answered.
    assertIdentical(answer, "simulated");
  });

  it("answers a send whose options carry no abort signal", async () => {
    // Given a client with a simulated send.
    const client: SendCapable = new FakeClient();
    installSendPatch(client, () => Promise.resolve("simulated"));

    // When it is sent with options that hold something else.
    const answer = await client.send({}, { abortSignal: "not a signal" });

    // Then the send answered.
    assertIdentical(answer, "simulated");
  });
});
