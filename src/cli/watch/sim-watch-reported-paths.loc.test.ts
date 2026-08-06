import path from "node:path";
import { afterEach, describe, it } from "vitest";
import { SimWatchArguments } from "./sim-watch-arguments.js";
import { SimWatchReporter } from "./sim-watch-reporter.js";
import { SimWatchSupervisor } from "./sim-watch-supervisor.js";
import { repoPath } from "../../util/filesystem/path.js";
import { WatchProject, watchPause } from "../../../test/cli/watch-project.js";
import {
  runSupervisor,
  stopSupervisors,
} from "../../../test/cli/running-supervisors.js";

const yulin = repoPath("src/index.js");
const tsx = repoPath(path.join("node_modules", ".bin", "tsx"));

/**
 * The paths Yulin holds that a module graph never mentions, watched without the
 * dev script listing them. Real Yulin in a real supervised process, because the
 * point is that the reporting happens where the path is registered.
 */
describe("paths a supervised process reports", () => {
  afterEach(stopSupervisors);

  it("watches a directory mounted into a Bucket", async () => {
    // Given a dev script that mounts a directory outside the project
    const project = await WatchProject.of({});
    const mounted = path.join(project.mountedPath(), "public");
    await project.writeMounted(path.join("public", "index.html"), "<h1>a</h1>");
    await project.write(
      "dev.ts",
      mountingScript(project.runsLogPath(), mounted),
    );
    const supervisor = supervise(project);
    await project.settled();
    runSupervisor(supervisor);
    await project.untilRuns(1);
    await watchPause(300);

    // When a file in that directory is edited
    await project.writeMounted(path.join("public", "index.html"), "<h1>b</h1>");

    // Then the process runs again, without the directory being named anywhere
    // but in the mount itself
    await project.untilRuns(2);
  });

  it("watches a template that was deployed", async () => {
    // Given a dev script that deploys a synthesized template from outside the
    // project, as a separate synth step would leave it
    const project = await WatchProject.of({});
    const templatePath = path.join(
      project.mountedPath(),
      "Stack.template.json",
    );
    await project.writeMounted("Stack.template.json", emptyTemplate);
    await project.write(
      "dev.ts",
      deployingScript(project.runsLogPath(), templatePath),
    );
    const supervisor = supervise(project);
    await project.settled();
    runSupervisor(supervisor);
    await project.untilRuns(1);
    await watchPause(300);

    // When the stack is synthesized again
    await project.writeMounted("Stack.template.json", changedTemplate);

    // Then the process runs again, rebinding against the new template
    await project.untilRuns(2);
  });
});

const emptyTemplate = JSON.stringify({ Resources: {} });
const changedTemplate = JSON.stringify({
  Resources: {
    Assets: { Type: "AWS::S3::Bucket", Properties: { BucketName: "assets" } },
  },
});

function mountingScript(runsLogPath: string, mountedPath: string): string {
  return String.raw`import { appendFileSync } from "node:fs";
import { SimAws } from ${JSON.stringify(yulin)};

appendFileSync(${JSON.stringify(runsLogPath)}, "run\n");

const simAws = new SimAws();
await simAws.s3().createBucket({ input: { Bucket: "site" } });
simAws.s3().mountBucketFilesystem("site", ${JSON.stringify(mountedPath)});

setInterval(() => {}, 60_000);
`;
}

function deployingScript(runsLogPath: string, templatePath: string): string {
  return String.raw`import { appendFileSync } from "node:fs";
import { SimAws } from ${JSON.stringify(yulin)};

appendFileSync(${JSON.stringify(runsLogPath)}, "run\n");

const simAws = new SimAws();
await simAws
  .cloudFormation()
  .deployTemplateFile({ templatePath: ${JSON.stringify(templatePath)} });

setInterval(() => {}, 60_000);
`;
}

function supervise(project: WatchProject): SimWatchSupervisor {
  return new SimWatchSupervisor({
    watchArguments: SimWatchArguments.parse(["--", tsx, "dev.ts"]),
    cwd: project.path(),
    reporter: new SimWatchReporter({
      cwd: project.path(),
      write: () => undefined,
    }),
  });
}
