import { describe, it } from "vitest";
import {
  ACMClient,
  DeleteCertificateCommand,
  DescribeCertificateCommand,
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimSdk } from "../../../sdk/index.js";

describe("simulated ACM SDK Command routing", () => {
  it("round-trips certificate Commands through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const client = new ACMClient({ region: "eu-west-1" });
    simSdk.intercept(client);

    const requestOutput = await client.send(
      new RequestCertificateCommand({ DomainName: "example.com" }),
    );

    // The certificate ARN carries the scope resolved per send: the client's
    // Region and the sim default Account.
    assertIdentical(
      requestOutput.CertificateArn,
      "arn:aws:acm:eu-west-1:888888888888:certificate/00000001",
    );

    const listOutput = await client.send(new ListCertificatesCommand({}));
    assertArrayLength(listOutput.CertificateSummaryList, 1);
    assertIdentical(
      listOutput.CertificateSummaryList[0].DomainName,
      "example.com",
    );

    assertNonNullable(requestOutput.CertificateArn);
    const describeOutput = await client.send(
      new DescribeCertificateCommand({
        CertificateArn: requestOutput.CertificateArn,
      }),
    );
    assertNonNullable(describeOutput.Certificate);
    assertIdentical(describeOutput.Certificate.DomainName, "example.com");
    assertIdentical(describeOutput.Certificate.Status, "PENDING_VALIDATION");
  });

  it("shares certificate state with direct sim ACM use", async () => {
    using simSdk = new SimSdk();
    const simAcm = simSdk.simAws.region("eu-west-1").acm();
    await simAcm.requestCertificate(
      new RequestCertificateCommand({ DomainName: "direct.example.com" }),
    );

    const client = new ACMClient({ region: "eu-west-1" });
    simSdk.intercept(client);

    const listOutput = await client.send(new ListCertificatesCommand({}));

    assertArrayLength(listOutput.CertificateSummaryList, 1);
    assertIdentical(
      listOutput.CertificateSummaryList[0].DomainName,
      "direct.example.com",
    );
  });

  it("rejects a Command simulated ACM does not support", async () => {
    using simSdk = new SimSdk();
    const client = new ACMClient({ region: "eu-west-1" });
    simSdk.intercept(client);

    const error = await assertThrowsErrorAsync(async () => {
      await client.send(
        new DeleteCertificateCommand({
          CertificateArn:
            "arn:aws:acm:eu-west-1:888888888888:certificate/00000001",
        }),
      );
    });

    assertStringIncludes(error.message, "DeleteCertificateCommand");
    assertStringIncludes(error.message, "RequestCertificateCommand");
  });
});
