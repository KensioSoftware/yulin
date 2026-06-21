import { execa } from "execa";
import { repoPath } from "./path.js";
import { TempDir } from "./temp-dir.js";

interface TestCdkProjectProps {
  projectDir?: TempDir;
}

/**
 * Convenience wrapper for temporary CDK projects used in tests.
 */
export class TestCdkProject {
  readonly projectDir: TempDir;

  constructor(props: TestCdkProjectProps = {}) {
    const { projectDir = new TempDir() } = props;
    this.projectDir = projectDir;
  }

  /**
   * Write the CDK app entrypoint file inside this temporary project.
   */
  async writeCdkAppFile(content: string): Promise<void> {
    await this.projectDir.writeFile("cdkApp.mjs", content);
  }

  /**
   * Synth the CDK app, returning the absolute path to the output directory.
   */
  async synth(relativeOutputPath = "cdk.out"): Promise<string> {
    await this.projectDir.resolvePath();
    const cdkAppFile = this.projectDir.join("cdkApp.mjs");
    const cdkOutDir = this.projectDir.join(relativeOutputPath);

    await execa(cdkBinPath(), [
      "synth",
      "--app",
      `node ${cdkAppFile}`,
      "--output",
      cdkOutDir,
    ]);

    return cdkOutDir;
  }
}

function cdkBinPath(): string {
  return repoPath(
    `node_modules/.bin/${process.platform === "win32" ? "cdk.cmd" : "cdk"}`,
  );
}
