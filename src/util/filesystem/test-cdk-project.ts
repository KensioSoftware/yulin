import { execa } from "execa";
import { repoPath } from "./path.js";
import { TemporaryDirectory as TemporaryDirectory } from "./temporary-directory.js";

interface TestCdkProjectProperties {
  projectDirectory?: TemporaryDirectory;
}

/**
 * Convenience wrapper for temporary CDK projects used in tests.
 */
export class TestCdkProject {
  readonly projectDirectory: TemporaryDirectory;

  constructor(properties: TestCdkProjectProperties = {}) {
    const { projectDirectory = new TemporaryDirectory() } = properties;
    this.projectDirectory = projectDirectory;
  }

  /**
   * Write the CDK app entrypoint file inside this temporary project.
   */
  async writeCdkAppFile(content: string): Promise<void> {
    await this.projectDirectory.writeFile("cdkApp.mjs", content);
  }

  /**
   * Synth the CDK app, returning the absolute path to the output directory.
   */
  async synth(relativeOutputPath = "cdk.out"): Promise<string> {
    await this.projectDirectory.resolvePath();
    const cdkAppFile = this.projectDirectory.join("cdkApp.mjs");
    const cdkOutDirectory = this.projectDirectory.join(relativeOutputPath);
    const appCommand = `node ${JSON.stringify(cdkAppFile)}`;

    await execa(cdkBinPath(), [
      "synth",
      "--app",
      appCommand,
      "--output",
      cdkOutDirectory,
    ]);

    return cdkOutDirectory;
  }
}

function cdkBinPath(): string {
  return repoPath(
    `node_modules/.bin/${process.platform === "win32" ? "cdk.cmd" : "cdk"}`,
  );
}
