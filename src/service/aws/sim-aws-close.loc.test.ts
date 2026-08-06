import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "./sim-aws.js";
import { HeldEnvironment } from "../../../test/aws/held-environment.js";

/**
 * Closing a simulated environment, with the real handles that keep a process
 * alive: a real template file being watched, a real directory being watched,
 * and both of them in more than one Account and Region.
 */
describe("closing a simulated AWS environment", () => {
  it("lets go of the watches in every scope it has reached", async () => {
    // Given a simulation watching a template file and a mounted directory in
    // its default scope and in another Account and Region
    const held = await HeldEnvironment.of();
    assertArrayLength(held.watchedPaths(), 4);

    // When the environment is closed, once
    await held.simAws.close();

    // Then nothing is left holding the process open, in either scope
    assertArrayEquals(held.watchedPaths(), []);
  });

  it("closes again without complaining", async () => {
    // Given a simulation that has already been closed
    const held = await HeldEnvironment.of();
    await held.simAws.close();

    // When it is closed again, as a script with two ways out of it does
    await held.simAws.close();

    // Then there was nothing left to close and nothing to say about it
    assertArrayEquals(held.watchedPaths(), []);
  });

  it("closes an environment that started nothing", async () => {
    // Given a simulation that never watched anything, and never even reached
    // for the services that could have
    const simAws = new SimAws();

    // When it is closed
    await simAws.close();

    // Then it is not an error, and nothing was brought into being to close
    assertArrayEquals(simAws.s3().watchedMountedDirectories(), []);
    assertArrayEquals(simAws.cloudFormation().watchedTemplateFiles(), []);
  });

  it("closes a simulation whose services hold nothing", async () => {
    // Given a simulation using services that never hold a handle open
    const simAws = new SimAws();
    await simAws.sqs().createQueue({ input: { QueueName: "work-to-do" } });

    // When it is closed
    await simAws.close();

    // Then there was nothing to let go of, and the Queue is still there
    const queues = await simAws.sqs().listQueues({ input: {} });
    assertIdentical(queues.QueueUrls?.length, 1);
  });

  it("closes on a signal, for a script that asked for that", async () => {
    // Given a simulation holding watches, which asked to be closed when the
    // process is signalled rather than writing the handler itself
    const held = await HeldEnvironment.of();
    const listening = process.listenerCount("SIGTERM");
    held.simAws.closeOnSignal();

    // When the process is asked to terminate
    process.emit("SIGTERM");
    await held.untilClosed();

    // Then everything it was holding has gone, and so has the handler
    assertArrayEquals(held.watchedPaths(), []);
    assertIdentical(process.listenerCount("SIGTERM"), listening);
  });

  it("leaves the simulated state it was serving where it was", async () => {
    // Given a closed simulation that had deployed a Stack and mounted a Bucket
    const held = await HeldEnvironment.of();
    await held.simAws.close();

    // When the environment is used afterwards
    const stacks = await held.simAws
      .cloudFormation()
      .describeStacks({ input: {} });
    const buckets = await held.simAws.s3().listBuckets({ input: {} });

    // Then everything it holds is still there: closing let go of the handles
    // that keep the process alive, not of the simulation
    assertIdentical(stacks.Stacks?.length, 1);
    assertIdentical(buckets.Buckets?.length, 1);
  });
});
