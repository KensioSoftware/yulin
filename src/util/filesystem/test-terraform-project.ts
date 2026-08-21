import { existsSync } from "node:fs";
import { execa } from "execa";
import { repoPath } from "./path.js";
import { TemporaryDirectory } from "./temporary-directory.js";

/**
 * A Terraform configuration under `test/terraform`, planned on demand.
 *
 * The plan JSON a Terraform import reads runs to thousands of lines, and the
 * configuration behind it runs to tens. Only the configuration is in the
 * repository, and this produces the plan from it the way `TestCdkProject`
 * produces a cloud assembly from a CDK app.
 *
 * `terraform init` downloads the AWS provider, which is one binary of about
 * 650MB. That is far too slow to sit inside a test, so it is left to
 * `pnpm tf:init` and to the workflow step that caches it. A configuration that
 * has never been initialised is reported rather than initialised here.
 */
export class TestTerraformProject {
  private readonly directory: string;

  constructor(public readonly name: string) {
    this.directory = repoPath(`test/terraform/${name}`);
  }

  /**
   * The plan JSON for this configuration, as `terraform show -json` writes it.
   *
   * The plan file goes to a temporary directory rather than into the
   * configuration, so a run leaves the repository as it found it.
   */
  async planJson(): Promise<unknown> {
    this.requireInitialised();

    const output = new TemporaryDirectory();
    await output.resolvePath();
    const planFile = output.join(`${this.name}.tfplan`);

    await this.plan(planFile);

    return JSON.parse(await this.show(planFile)) as unknown;
  }

  /**
   * Write the plan file, tolerating a data source that could not be read.
   *
   * Planning offline fails every `data` block that calls AWS, and community
   * modules commonly read `aws_caller_identity`. Terraform reports those as
   * errors and exits non-zero, and it still writes a plan covering the managed
   * resources. Whether the plan file arrived is the contract that matters here,
   * because the managed resources are what an import reads.
   */
  private async plan(planFile: string): Promise<void> {
    const result = await execa(
      "terraform",
      [`-chdir=${this.directory}`, "plan", "-input=false", "-out", planFile],
      { env: { TF_IN_AUTOMATION: "1" }, reject: false },
    );

    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    if (!existsSync(planFile)) {
      throw new Error(
        `terraform plan wrote no plan for ${this.name}: ${result.stderr}`,
      );
    }
  }

  private async show(planFile: string): Promise<string> {
    const { stdout } = await execa(
      "terraform",
      [`-chdir=${this.directory}`, "show", "-json", planFile],
      { env: { TF_IN_AUTOMATION: "1" } },
    );

    return stdout;
  }

  /**
   * Fail with what to run, rather than with what Terraform says.
   *
   * Terraform's own message for an uninitialised directory names a command
   * that would work and say nothing about the provider cache this repository
   * shares between its two configurations.
   */
  private requireInitialised(): void {
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    if (existsSync(`${this.directory}/.terraform`)) {
      return;
    }

    throw new Error(
      `Terraform configuration ${this.name} is not initialised. ` +
        `Run \`pnpm tf:init\` first. It downloads the AWS provider, which ` +
        `takes a few minutes the first time and nothing afterwards.`,
    );
  }
}
