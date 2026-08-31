import {
  AddListenerCertificatesCommand,
  DescribeListenerCertificatesCommand,
  RemoveListenerCertificatesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimElbV2CertificateNotFoundException,
  SimElbV2InvalidConfigurationRequestException,
  SimElbV2ListenerNotFoundException,
  SimElbV2OperationNotPermittedException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";
import type { SimElbV2 } from "../../sim-elbv2.js";
import {
  createFixtureCertificate,
  createFixtureHttpsListener,
  createFixtureLambdaTargetGroup,
  createFixtureListener,
  createFixtureLoadBalancer,
} from "../../sim-elbv2.fixture.js";

/**
 * What a test about a listener's certificate list starts from.
 */
interface CertificateFixture {
  readonly elbV2: SimElbV2;
  readonly listenerArn: string;
  readonly defaultCertificateArn: string;
  readonly adminCertificateArn: string;
}

/**
 * An HTTPS listener with one certificate on it, and a second issued
 * certificate for a test to add.
 */
async function makeHttpsListener(simAws: SimAws): Promise<CertificateFixture> {
  const elbV2 = simAws.elbV2();
  const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
  const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);
  const defaultCertificateArn = await createFixtureCertificate(simAws);
  const adminCertificateArn = await createFixtureCertificate(
    simAws,
    simAws.acm(),
    "admin.example.com",
  );
  const listenerArn = await createFixtureHttpsListener(
    elbV2,
    loadBalancerArn,
    targetGroupArn,
    defaultCertificateArn,
  );

  return { elbV2, listenerArn, defaultCertificateArn, adminCertificateArn };
}

describe("ELBv2 listener certificates", () => {
  it("adds a certificate, reports it and takes it off again", async () => {
    // Given an HTTPS listener with its default certificate.
    const simAws = new SimAws();
    const { elbV2, listenerArn, defaultCertificateArn, adminCertificateArn } =
      await makeHttpsListener(simAws);

    // When a second certificate is added, described and then removed.
    await elbV2.addListenerCertificates(
      new AddListenerCertificatesCommand({
        ListenerArn: listenerArn,
        Certificates: [{ CertificateArn: adminCertificateArn }],
      }),
    );
    const carried = await elbV2.describeListenerCertificates(
      new DescribeListenerCertificatesCommand({ ListenerArn: listenerArn }),
    );

    await elbV2.removeListenerCertificates(
      new RemoveListenerCertificatesCommand({
        ListenerArn: listenerArn,
        Certificates: [{ CertificateArn: adminCertificateArn }],
      }),
    );

    const remaining = await elbV2.describeListenerCertificates(
      new DescribeListenerCertificatesCommand({ ListenerArn: listenerArn }),
    );

    // Then both were reported while it was on, the default one flagged as
    // such, and the listener kept its default when the other came off.
    assertArrayLength(carried.Certificates, 2);
    assertIdentical(
      carried.Certificates[0].CertificateArn,
      defaultCertificateArn,
    );
    assertTrue(carried.Certificates[0].IsDefault);
    assertIdentical(
      carried.Certificates[1].CertificateArn,
      adminCertificateArn,
    );
    assertFalse(carried.Certificates[1].IsDefault);
    assertArrayLength(remaining.Certificates, 1);
    assertIdentical(
      remaining.Certificates[0].CertificateArn,
      defaultCertificateArn,
    );
  });

  it("carries a certificate added twice once", async () => {
    // Given an HTTPS listener.
    const simAws = new SimAws();
    const { elbV2, listenerArn, defaultCertificateArn, adminCertificateArn } =
      await makeHttpsListener(simAws);

    // When the same certificate is added twice, and the default one is added
    // to the list it is already the head of.
    const add = new AddListenerCertificatesCommand({
      ListenerArn: listenerArn,
      Certificates: [{ CertificateArn: adminCertificateArn }],
    });

    await elbV2.addListenerCertificates(add);
    await elbV2.addListenerCertificates(add);
    await elbV2.addListenerCertificates(
      new AddListenerCertificatesCommand({
        ListenerArn: listenerArn,
        Certificates: [{ CertificateArn: defaultCertificateArn }],
      }),
    );

    const carried = await elbV2.describeListenerCertificates(
      new DescribeListenerCertificatesCommand({ ListenerArn: listenerArn }),
    );

    // Then the listener carries each once, as real ELB answers the second
    // request successfully without listing the certificate twice.
    assertArrayLength(carried.Certificates, 2);
    assertTrue(carried.Certificates[0].IsDefault);
  });

  it("refuses to take the default certificate off a listener", async () => {
    // Given an HTTPS listener with its default certificate.
    const simAws = new SimAws();
    const { elbV2, listenerArn, defaultCertificateArn } =
      await makeHttpsListener(simAws);

    // When a request tries to remove it.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.removeListenerCertificates(
        new RemoveListenerCertificatesCommand({
          ListenerArn: listenerArn,
          Certificates: [{ CertificateArn: defaultCertificateArn }],
        }),
      );
    });

    assertInstanceOf(error, SimElbV2OperationNotPermittedException);

    // Then it is refused, naming what replaces a default certificate instead.
    assertStringIncludes(error.message, defaultCertificateArn);
    assertStringIncludes(error.message, "ModifyListener");
  });

  it("refuses a certificate simulated ACM does not hold as issued", async () => {
    // Given an HTTPS listener and a certificate still pending validation.
    const simAws = new SimAws();
    const { elbV2, listenerArn } = await makeHttpsListener(simAws);
    const pending = await simAws
      .acm()
      .requireDnsValidation()
      .requestCertificate({ input: { DomainName: "orders.example.com" } });

    await simAws.backgroundTasksComplete();

    // When each is added to the listener.
    const missing = await assertThrowsErrorAsync(async () => {
      await elbV2.addListenerCertificates(
        new AddListenerCertificatesCommand({
          ListenerArn: listenerArn,
          Certificates: [
            {
              CertificateArn:
                "arn:aws:acm:us-east-1:888888888888:certificate/00000009",
            },
          ],
        }),
      );
    });

    assertInstanceOf(missing, SimElbV2CertificateNotFoundException);

    const notIssued = await assertThrowsErrorAsync(async () => {
      await elbV2.addListenerCertificates(
        new AddListenerCertificatesCommand({
          ListenerArn: listenerArn,
          Certificates: [{ CertificateArn: pending.CertificateArn }],
        }),
      );
    });

    assertInstanceOf(notIssued, SimElbV2InvalidConfigurationRequestException);

    // Then both are refused, the same way a listener's own certificate is.
    assertStringIncludes(missing.message, "not found in simulated ACM");
    assertStringIncludes(notIssued.message, "not ISSUED");
  });

  it("refuses a certificate on a listener that speaks no TLS", async () => {
    // Given an HTTP listener.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);
    const listenerArn = await createFixtureListener(
      elbV2,
      loadBalancerArn,
      targetGroupArn,
    );
    const certificateArn = await createFixtureCertificate(simAws);

    // When a certificate is added to it.
    const error = await assertThrowsErrorAsync(async () => {
      await elbV2.addListenerCertificates(
        new AddListenerCertificatesCommand({
          ListenerArn: listenerArn,
          Certificates: [{ CertificateArn: certificateArn }],
        }),
      );
    });

    assertInstanceOf(error, SimElbV2InvalidConfigurationRequestException);

    // Then it is refused rather than held where nothing would present it.
    assertStringIncludes(error.message, "HTTPS listener");
  });

  it("reports no certificates for a listener carrying none", async () => {
    // Given an HTTP listener.
    const simAws = new SimAws();
    const elbV2 = simAws.elbV2();
    const loadBalancerArn = await createFixtureLoadBalancer(elbV2);
    const targetGroupArn = await createFixtureLambdaTargetGroup(elbV2);
    const listenerArn = await createFixtureListener(
      elbV2,
      loadBalancerArn,
      targetGroupArn,
    );

    // When its certificates are described.
    const output = await elbV2.describeListenerCertificates(
      new DescribeListenerCertificatesCommand({ ListenerArn: listenerArn }),
    );

    // Then it carries none.
    assertArrayEmpty(output.Certificates);
  });

  it("refuses a request naming no listener or no certificate", async () => {
    // Given an HTTPS listener.
    const simAws = new SimAws();
    const { elbV2, listenerArn, adminCertificateArn } =
      await makeHttpsListener(simAws);

    // When requests leave out the listener, the certificates, or name a
    // listener that does not exist.
    const noListener = await assertThrowsErrorAsync(async () => {
      await elbV2.addListenerCertificates({
        input: { Certificates: [{ CertificateArn: adminCertificateArn }] },
      });
    });

    assertInstanceOf(noListener, SimElbV2ValidationError);

    const noCertificates = await assertThrowsErrorAsync(async () => {
      await elbV2.removeListenerCertificates({
        input: { ListenerArn: listenerArn },
      });
    });

    assertInstanceOf(noCertificates, SimElbV2ValidationError);

    const noRemoveListener = await assertThrowsErrorAsync(async () => {
      await elbV2.removeListenerCertificates({
        input: { Certificates: [{ CertificateArn: adminCertificateArn }] },
      });
    });

    assertInstanceOf(noRemoveListener, SimElbV2ValidationError);

    const noDescribeListener = await assertThrowsErrorAsync(async () => {
      await elbV2.describeListenerCertificates({ input: {} });
    });

    assertInstanceOf(noDescribeListener, SimElbV2ValidationError);

    const unknown = await assertThrowsErrorAsync(async () => {
      await elbV2.describeListenerCertificates(
        new DescribeListenerCertificatesCommand({ ListenerArn: "arn:missing" }),
      );
    });

    assertInstanceOf(unknown, SimElbV2ListenerNotFoundException);

    // Then each is refused.
    assertStringIncludes(noListener.message, "ListenerArn is required");
    assertStringIncludes(noRemoveListener.message, "ListenerArn is required");
    assertStringIncludes(noCertificates.message, "at least one certificate");
    assertStringIncludes(noDescribeListener.message, "ListenerArn is required");
    assertStringIncludes(unknown.message, "arn:missing");
  });
});
