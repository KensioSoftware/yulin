import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertStringEndsWith,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimWatchRuntime } from "./sim-watch-runtime.js";
import { simWatchMessages } from "./sim-watch.config.js";
import { FakeProcess } from "../../test/watch/fake-process.js";

describe("SimWatchRuntime", () => {
  it("does nothing in a process no supervisor started", () => {
    // Given an ordinary process, such as a test run
    const host = new FakeProcess({ supervised: false });
    const runtime = new SimWatchRuntime({ host });

    // When a path is reported
    runtime.reportPath("/projects/media/assets");

    // Then nothing is sent anywhere
    assertFalse(runtime.supervised());
    assertArrayEquals(host.sent, []);
  });

  it("does nothing in a supervised process with no channel", () => {
    // Given the marker set but no way to answer, as an inherited environment
    // in an unrelated process would look
    const host = new FakeProcess({ supervised: true, connected: false });
    const runtime = new SimWatchRuntime({ host });

    // When a path is reported
    runtime.reportPath("/projects/media/assets");

    // Then it is dropped rather than assumed to have gone somewhere
    assertFalse(runtime.supervised());
  });

  it("names a path to the supervisor that started it", () => {
    // Given a process `yulin watch` started
    const host = new FakeProcess();
    const runtime = new SimWatchRuntime({ host });

    // When a path is reported
    runtime.reportPath("assets/uploads");

    // Then the supervisor is told, in a form it can watch
    assertArrayLength(host.sent, 1);
    const [reported = {}] = host.sent;
    assertIdentical(reported["type"], simWatchMessages.path);
    assertStringEndsWith(String(reported["path"]), "assets/uploads");
  });

  it("names a path it is answering itself, so the supervisor leaves it", () => {
    // Given a process `yulin watch` started, watching a template it updates
    // the Stack from in place
    const host = new FakeProcess();
    const runtime = new SimWatchRuntime({ host });

    // When the path is held
    runtime.reportHeldPath("cdk.out/Site.template.json");

    // Then the supervisor is told not to restart for it
    assertArrayLength(host.sent, 1);
    const [held = {}] = host.sent;
    assertIdentical(held["type"], simWatchMessages.heldPath);
    assertStringEndsWith(String(held["path"]), "cdk.out/Site.template.json");
  });

  it("holds no path in a process no supervisor started", () => {
    // Given an ordinary process, such as a test run
    const host = new FakeProcess({ supervised: false });
    const runtime = new SimWatchRuntime({ host });

    // When a path is held
    runtime.reportHeldPath("cdk.out/Site.template.json");

    // Then nothing is sent anywhere
    assertArrayEquals(host.sent, []);
  });

  it("passes on the warning that a restart is coming", () => {
    // Given a supervised process listening for a restart
    const host = new FakeProcess();
    const runtime = new SimWatchRuntime({ host });
    let warned = 0;
    runtime.onStopping(() => {
      warned += 1;
    });

    // When the supervisor says it is about to restart this process
    host.deliver({ type: simWatchMessages.stopping });

    // Then the listener runs, and the supervisor is told it can go ahead
    assertIdentical(warned, 1);
    assertIdentical(host.sent.at(-1)?.["type"], simWatchMessages.stopped);
  });

  it("ignores a message that is not the warning", () => {
    // Given a supervised process listening for a restart
    const host = new FakeProcess();
    const runtime = new SimWatchRuntime({ host });
    let warned = 0;
    runtime.onStopping(() => {
      warned += 1;
    });

    // When some other message arrives
    host.deliver({ type: "something-else" });

    // Then nothing is done about it
    assertIdentical(warned, 0);
  });

  it("listens once however many servers are interested", () => {
    // Given two served environments in the same process
    const host = new FakeProcess();
    const runtime = new SimWatchRuntime({ host });
    const first = (): void => undefined;
    const second = (): void => undefined;

    // When both ask to hear about a restart
    runtime.onStopping(first);
    runtime.onStopping(second);

    // Then the process is listened to once
    assertArrayLength(host.listeners, 1);
  });

  it("stops listening once nothing is interested", () => {
    // Given a listener that has been removed again, as a closed server does
    const host = new FakeProcess();
    const runtime = new SimWatchRuntime({ host });
    let warned = 0;
    const listener = (): void => {
      warned += 1;
    };
    runtime.onStopping(listener);
    runtime.offStopping(listener);

    // When the supervisor says it is about to restart this process
    host.deliver({ type: simWatchMessages.stopping });

    // Then nothing is left holding a reference to a closed server
    assertIdentical(warned, 0);
    assertArrayEquals(host.listeners, []);
  });

  it("does not listen in a process no supervisor started", () => {
    // Given an ordinary process
    const host = new FakeProcess({ supervised: false });
    const runtime = new SimWatchRuntime({ host });

    // When something asks to hear about a restart
    runtime.onStopping(() => undefined);

    // Then nothing is attached to a process that will never be told
    assertArrayEquals(host.listeners, []);
  });
});
