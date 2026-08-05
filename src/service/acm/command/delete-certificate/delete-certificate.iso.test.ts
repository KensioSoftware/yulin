import {
  DeleteCertificateCommand,
  DescribeCertificateCommand,
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimAcm } from "../../sim-acm.js";
import { SimAcmResourceNotFoundException } from "../../error/sim-acm.error.js";

async function givenCertificate(
  simAcm: SimAcm,
  domainName: string,
): Promise<string> {
  const requested = await simAcm.requestCertificate(
    new RequestCertificateCommand({ DomainName: domainName }),
  );
  assertNonNullable(requested.CertificateArn);

  return requested.CertificateArn;
}

describe("ACM DeleteCertificateCommand", () => {
  it("deletes a Certificate so it can no longer be described", async () => {
    // Given a requested Certificate.
    const simAcm = new SimAws().acm();
    const certificateArn = await givenCertificate(simAcm, "disposable.test");

    // When the Certificate is deleted.
    await simAcm.deleteCertificate(
      new DeleteCertificateCommand({ CertificateArn: certificateArn }),
    );

    // Then ACM no longer has it.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.describeCertificate(
        new DescribeCertificateCommand({ CertificateArn: certificateArn }),
      ),
    );
    assertInstanceOf(error, SimAcmResourceNotFoundException);

    const listed = await simAcm.listCertificates(
      new ListCertificatesCommand({}),
    );
    assertArrayLength(listed.CertificateSummaryList, 0);
  });

  it("rejects a Certificate that does not exist", async () => {
    // Given a simulated ACM without the requested Certificate.
    const simAws = new SimAws();
    const simAcm = simAws.acm();

    // When the missing Certificate is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.deleteCertificate(
        new DeleteCertificateCommand({
          CertificateArn:
            `arn:aws:acm:${simAws.defaultRegionName}:` +
            `${simAws.defaultAccountId}:certificate/absent`,
        }),
      ),
    );

    // Then ACM answers with its not-found error.
    assertInstanceOf(error, SimAcmResourceNotFoundException);
  });

  it("rejects a missing required CertificateArn input", async () => {
    // Given a simulated ACM.
    const simAcm = new SimAws().acm();

    // When DeleteCertificate is called without its required CertificateArn.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.deleteCertificate(
        // @ts-expect-error -- testing invalid input
        new DeleteCertificateCommand({}),
      ),
    );

    // Then request validation identifies the missing input.
    assertStringIncludes(
      error.message,
      "DeleteCertificateCommand.input.CertificateArn",
    );
  });

  it("denies a caller without DeleteCertificate permission", async () => {
    // Given a Certificate in a simulation with IAM.
    const simAcm = new SimAws().acm();
    const certificateArn = await givenCertificate(simAcm, "protected.test");

    // When an anonymous caller deletes it.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.deleteCertificate(
        new DeleteCertificateCommand({ CertificateArn: certificateArn }),
        { caller: { kind: "anonymous" } },
      ),
    );

    // Then IAM denies the removal action, and the Certificate stays.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "acm:DeleteCertificate");

    const stillThere = await simAcm.describeCertificate(
      new DescribeCertificateCommand({ CertificateArn: certificateArn }),
    );
    assertNonNullable(stillThere.Certificate);
    assertIdentical(stillThere.Certificate.DomainName, "protected.test");
  });
});
