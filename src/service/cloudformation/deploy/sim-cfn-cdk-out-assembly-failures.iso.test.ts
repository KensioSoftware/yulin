import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { simCdkCloudAssemblyFactory } from "../cdk/sim-cdk-cloud-assembly.factory.js";

describe("Deploying a CDK cloud assembly that cannot be deployed [iso]", () => {
  it("fails naming the manifest it looked for when the directory holds no cloud assembly", async () => {
    // Given a directory that is not a cloud assembly, since the assembly is
    // written in the `cdk.out` beneath it.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [{ artifactId: "SiteStack", regionName: "eu-west-2" }],
    });

    // When it is deployed.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployCdkOut(directory.path()),
    );

    // Then the failure names the file it expected to find.
    assertStringIncludes(
      error.message,
      "Could not read the CDK cloud assembly manifest at",
    );
    assertStringIncludes(error.message, "manifest.json");
  });

  it("fails naming the Stacks the assembly does hold when asked for one it lacks", async () => {
    // Given an assembly holding a Stack under a name a caller no longer uses.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [
        { artifactId: "SiteStack", regionName: "eu-west-2" },
        { artifactId: "DataStack", regionName: "eu-west-2" },
      ],
    });

    // When the old name is asked for.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployCdkOut({
        directoryPath: directory.join("cdk.out"),
        stackNames: ["WebsiteStack"],
      }),
    );

    // Then the failure says what it could have been asked for instead.
    assertStringIncludes(error.message, "holds no Stack named WebsiteStack");
    assertStringIncludes(error.message, "It holds SiteStack, DataStack.");
  });

  it("fails when the Stacks in the assembly depend on each other in a cycle", async () => {
    // Given an assembly whose two Stacks each come after the other.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [
        {
          artifactId: "SiteStack",
          regionName: "eu-west-2",
          dependencies: ["DataStack"],
        },
        {
          artifactId: "DataStack",
          regionName: "eu-west-2",
          dependencies: ["SiteStack"],
        },
      ],
    });

    // When the assembly is deployed.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployCdkOut(directory.join("cdk.out")),
    );

    // Then the failure names the cycle rather than deploying either of them.
    assertStringIncludes(
      error.message,
      "there is no order to deploy them in: SiteStack -> DataStack -> SiteStack",
    );
  });
});
