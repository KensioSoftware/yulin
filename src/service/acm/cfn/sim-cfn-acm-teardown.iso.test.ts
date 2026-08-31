import { assertArrayEmpty, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { ListCertificatesCommand } from "@aws-sdk/client-acm";

import { SimAws } from "../../aws/sim-aws.js";

describe("ACM CloudFormation Resource teardown", () => {
  it("deletes the certificate a Stack issued", async () => {
    // Given a deployed certificate.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "certificate-stack",
      template: {
        Resources: {
          SiteCertificate: {
            Type: "AWS::CertificateManager::Certificate",
            Properties: {
              DomainName: "example.test",
              ValidationMethod: "DNS",
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // When the Stack's Resources are torn down.
    await stack.teardown();
    await simAws.backgroundTasksComplete();

    // Then ACM no longer lists it.
    const listed = await simAws
      .acm()
      .listCertificates(new ListCertificatesCommand());

    assertArrayEmpty(listed.CertificateSummaryList);
    assertIdentical(
      stack.getResource("SiteCertificate")?.status,
      "DELETE_COMPLETE",
    );
  });
});
