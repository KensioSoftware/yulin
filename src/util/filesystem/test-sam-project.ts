import { execa } from "execa";
import { samEndpointMethods } from "./test-sam-endpoint-methods.js";
import { TemporaryDirectory } from "./temporary-directory.js";

interface TestSamProjectProperties {
  projectDirectory?: TemporaryDirectory;
}

/**
 * One API of a template, and the methods the SAM CLI says it serves.
 */
export interface TestSamEndpoint {
  /** The logical ID the expansion gave the API. */
  readonly logicalId: string;
  /** One `GET /rates/{currency}` per method, in no particular order. */
  readonly methods: readonly string[];
}

/**
 * The name the SAM CLI is invoked by. It installs through pip, Homebrew or the
 * AWS installer and has no npm package, so it is whatever the machine put on
 * the PATH rather than something under `node_modules`.
 */
const samBinaryName = "sam";

/**
 * The Region every command is given. The SAM CLI refuses to read a template at
 * all without one, and nothing here talks to AWS.
 */
const regionName = "us-east-1";

/**
 * The environment the SAM CLI runs under. Telemetry is off because these are
 * tests, and they run on every CI build.
 */
const samEnvironment = { SAM_CLI_TELEMETRY: "0" };

/**
 * The version of the SAM CLI on the PATH, or nothing where there is none.
 *
 * A test comparing against real SAM asks for this first, because a machine
 * without the CLI has to skip rather than fail.
 */
export async function testSamCliVersion(): Promise<string | undefined> {
  try {
    const { stdout } = await execa(samBinaryName, ["--version"], {
      env: samEnvironment,
    });

    return stdout.trim();
  } catch {
    return undefined;
  }
}

/**
 * Convenience wrapper for temporary SAM projects used in tests.
 *
 * The SAM CLI expands a template through `aws-sam-translator`, the Python
 * library AWS runs the real transform in. `sam list` reads a template off disk
 * and reports what deploying it would create, which is the expansion itself
 * with nothing built and no AWS account involved.
 */
export class TestSamProject {
  readonly projectDirectory: TemporaryDirectory;

  constructor(properties: TestSamProjectProperties = {}) {
    const { projectDirectory = new TemporaryDirectory() } = properties;
    this.projectDirectory = projectDirectory;
  }

  /**
   * Write the SAM template this project is expanded from.
   *
   * The template is written as JSON, which the SAM CLI reads as readily as
   * YAML, so one template object drives both the CLI and a simulated
   * deployment of the same thing.
   */
  async writeTemplate(template: object): Promise<void> {
    await this.projectDirectory.writeFile(
      "template.json",
      JSON.stringify(template, undefined, 2),
    );
  }

  /**
   * The logical IDs of the Resources deploying this template would create.
   */
  async listResources(): Promise<string[]> {
    const listed = await this.list<{ LogicalResourceId: string }>("resources");

    return listed.map((resource) => resource.LogicalResourceId);
  }

  /**
   * The APIs this template deploys, and the methods each of them serves.
   *
   * A function is listed here too, with `Methods` set to a placeholder rather
   * than a list, and is left out.
   */
  async listEndpoints(): Promise<TestSamEndpoint[]> {
    const listed = await this.list<{
      LogicalResourceId: string;
      Methods: string[] | string;
    }>("endpoints");

    return listed
      .filter((endpoint) => Array.isArray(endpoint.Methods))
      .map((endpoint) => ({
        logicalId: endpoint.LogicalResourceId,
        methods: [endpoint.Methods].flat().flatMap(samEndpointMethods),
      }));
  }

  /**
   * Run one `sam list` command over this project's template.
   */
  private async list<Listed>(area: string): Promise<Listed[]> {
    await this.projectDirectory.resolvePath();

    const { stdout } = await execa(
      samBinaryName,
      [
        "list",
        area,
        "--output",
        "json",
        "--region",
        regionName,
        "--template-file",
        this.projectDirectory.join("template.json"),
      ],
      { env: samEnvironment },
    );

    return JSON.parse(stdout) as Listed[];
  }
}
