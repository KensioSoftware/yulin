import { assertArrayEquals, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { serveSimAws } from "./sim-aws-local-server.js";
import { SimAws } from "../../../service/aws/sim-aws.js";
import { heldPause } from "../../../../test/aws/held-environment.js";
import {
  closingScript,
  ServedProject,
  signalledScript,
} from "../../../../test/serve/served-project.js";

/**
 * One call for everything a served environment is holding open.
 *
 * The process is the assertion in most of this: a real script serving a real
 * port, watching a real template file and a real directory, and then exiting on
 * its own after one awaited close. Nothing else can say whether something was
 * left holding the event loop.
 */
describe("closing a served simulated AWS environment", () => {
  it("lets go of the watches the environment was holding", async () => {
    // Given a served environment watching a template file and a mounted
    // directory
    const project = await ServedProject.of();
    const simAws = new SimAws();
    const srv = await serveSimAws({ simAws, port: 0 });
    await project.hold(simAws, srv);

    // When the server is closed, and nothing else is
    await srv.close();

    // Then the environment let go of what it was holding too, rather than
    // leaving it for a second call
    assertArrayEquals(simAws.cloudFormation().watchedTemplateFiles(), []);
    assertArrayEquals(simAws.s3().watchedMountedDirectories(), []);
  });

  it("installs a signal handler only when it is asked for one", async () => {
    // Given a served environment nobody has asked for a handler from
    const project = await ServedProject.of();
    const listening = process.listenerCount("SIGTERM");
    const simAws = new SimAws();
    const srv = await serveSimAws({ simAws, port: 0 });
    await project.hold(simAws, srv);
    assertIdentical(process.listenerCount("SIGTERM"), listening);

    // When it is asked for one, and the process is asked to terminate
    srv.closeOnSignal();
    process.emit("SIGTERM");
    await untilClosed(simAws);

    // Then everything the served environment held has gone, and the handler
    // with it
    assertArrayEquals(simAws.cloudFormation().watchedTemplateFiles(), []);
    assertIdentical(process.listenerCount("SIGTERM"), listening);
  });

  it("exits the process it was serving from", async () => {
    // Given a script that serves an environment, deploys a watched template
    // and mounts a watched directory, then awaits one close
    const project = await ServedProject.of();
    await project.writeScript(closingScript(project));

    // When it is run as a process of its own
    const run = await project.run();

    // Then it got everything up, and then exited on its own, with nothing left
    // holding the event loop open
    assertIdentical(run.stdout.trim(), "watching 2\nclosed");
    assertIdentical(run.code, 0);
  });

  it("exits on a signal it was asked to close for", async () => {
    // Given the same script, having asked for a signal handler rather than
    // writing one
    const project = await ServedProject.of();
    await project.writeScript(signalledScript(project));

    // When the process is asked to terminate
    const run = await project.run({ signal: "SIGTERM" });

    // Then it closed what it was holding and exited, without the script having
    // taken over the signal itself
    assertIdentical(run.stdout.trim(), "watching 2\nclosed");
    assertIdentical(run.code, 0);
  });
});

/**
 * Wait for a close nothing handed back a promise for, as a signal handler's is.
 */
async function untilClosed(simAws: SimAws, withinMs = 5000): Promise<void> {
  const giveUpAt = Date.now() + withinMs;

  while (simAws.s3().watchedMountedDirectories().length > 0) {
    if (Date.now() >= giveUpAt) {
      throw new Error("The served environment was not closed");
    }

    // oxlint-disable-next-line no-await-in-loop -- polling for a close
    await heldPause(10);
  }
}
