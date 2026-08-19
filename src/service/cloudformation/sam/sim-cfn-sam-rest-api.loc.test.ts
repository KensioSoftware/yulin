import { assertArrayEquals, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  samCliMissing,
  samRestApiTemplate,
  servedMethods,
  sortedNames,
  stageLogicalIds,
} from "../../../../test/cloudformation/sam-cli.js";
import { SimAws } from "../../aws/sim-aws.js";
import { TestSamProject } from "../../../util/filesystem/test-sam-project.js";

/**
 * The stages the template publishes, as the SAM CLI names them.
 */
const expectedStages = [
  "RatesApiStageaed0986a76",
  "ServerlessRestApiProdStage",
];

/**
 * The APIs the template deploys, as the SAM CLI names them.
 */
const expectedApis = ["RatesApi", "ServerlessRestApi"];

describe.skipIf(samCliMissing)(
  "SAM REST API expansion against the SAM CLI",
  () => {
    it("expands the APIs, stages and methods real SAM expands", async () => {
      // Given a SAM template the real CLI and this simulation are both given
      const samProject = new TestSamProject();
      await samProject.writeTemplate(samRestApiTemplate);

      // When the SAM CLI is asked what deploying it would create, and the same
      // template is deployed here
      const samResources = await samProject.listResources();
      const samEndpoints = await samProject.listEndpoints();

      const simAws = new SimAws();
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "rates-stack",
        template: samRestApiTemplate,
      });
      await stack.waitForDeployComplete();

      // Then the stages SAM publishes are the stages deployed here, under the
      // logical IDs SAM builds for them
      assertArrayEquals(stageLogicalIds(samResources), expectedStages);

      for (const logicalId of expectedStages) {
        assertNonNullable(
          stack.getResource(logicalId),
          `${logicalId} was not deployed`,
        );
      }

      // And every API SAM reports serves the methods it reports, off the paths
      // it reports them under
      assertArrayEquals(
        sortedNames(samEndpoints.map((endpoint) => endpoint.logicalId)),
        expectedApis,
      );

      for (const endpoint of samEndpoints) {
        assertArrayEquals(
          servedMethods(stack, endpoint.logicalId),
          sortedNames(endpoint.methods),
        );
      }
    });
  },
);
