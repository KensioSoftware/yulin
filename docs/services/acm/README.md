# Simulated ACM

Yulin includes a simulated AWS Certificate Manager (ACM) service for tests and local development.

Sim ACM can be used through `SimAws` to request certificates, inspect certificate details, list
certificates, and create certificates from sim CloudFormation templates.

## Available functionality

Sim ACM currently supports:

- Requesting certificates with `RequestCertificateCommand`
- Describing certificates with `DescribeCertificateCommand`
- Listing certificates with `ListCertificatesCommand`
- DNS and EMAIL validation method shapes (but validation always succeeds regardless)
- Subject alternative names
- Certificate tags, up to the ACM limit of 50 tags
- Deterministic simulated certificate ARNs scoped to account and region
- Deterministic DNS validation CNAME records
- Background certificate issuance from `PENDING_VALIDATION` to `ISSUED`
- CloudFormation resource:
  - `AWS::CertificateManager::Certificate`
- CloudFormation `Ref` and `Fn::GetAtt` values for ACM certificates

The simulator focuses on useful behavior for isolated tests and local development rather than full
ACM feature parity. Unsupported ACM options may be ignored or may throw errors depending on whether
the simulator needs them to model the requested behavior.

## Basic certificate request

Create a simulated AWS environment, get simulated ACM, and request a certificate.

```typescript sim-acm-request-certificate
/**
 * Requesting a simulated ACM certificate.
 */

import {
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.account("555555555555").region("eu-west-1").acm();

const requestOutput = await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "example.test",
  }),
);

console.log(requestOutput.CertificateArn);

const listOutput = await acm.listCertificates(new ListCertificatesCommand());

console.log(listOutput.CertificateSummaryList?.[0]?.DomainName);
console.log(listOutput.CertificateSummaryList?.[0]?.Status);
```

Certificate ARNs include the selected simulated account and region, for example:

```text
arn:aws:acm:eu-west-1:555555555555:certificate/00000001
```

Multiple certificates can be requested for the same domain. Each request receives a distinct
certificate ARN.

## Subject alternative names

Pass `SubjectAlternativeNames` when the certificate should cover more than one DNS name.

```typescript sim-acm-subject-alternative-names
/**
 * Requesting a simulated ACM certificate with subject alternative names.
 */

import {
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.acm();

const requestOutput = await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "example.test",
    SubjectAlternativeNames: ["www.example.test", "api.example.test"],
  }),
);

const listOutput = await acm.listCertificates(new ListCertificatesCommand());

console.log(requestOutput.CertificateArn);
console.log(
  listOutput.CertificateSummaryList?.[0]?.SubjectAlternativeNameSummaries,
);
```

`ListCertificatesCommand` includes up to 100 subject alternative names in each summary. If a
certificate has more than 100 names, `HasAdditionalSubjectAlternativeNames` is set on the summary.

## Describing certificates and validation records

Use `DescribeCertificateCommand` to inspect certificate details, including validation options.

```typescript sim-acm-describe-certificate
/**
 * Describing a simulated ACM certificate and its DNS validation records.
 */

import {
  DescribeCertificateCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.acm();

const requestOutput = await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "example.test",
    SubjectAlternativeNames: ["www.example.test"],
    ValidationMethod: "DNS",
  }),
);

const describeOutput = await acm.describeCertificate(
  new DescribeCertificateCommand({
    CertificateArn: requestOutput.CertificateArn,
  }),
);

const certificate = describeOutput.Certificate;

console.log(certificate?.DomainName);
console.log(certificate?.Status);

for (const validation of certificate?.DomainValidationOptions ?? []) {
  console.log(validation.DomainName);
  console.log(validation.ValidationMethod);
  console.log(validation.ResourceRecord?.Name);
  console.log(validation.ResourceRecord?.Type);
  console.log(validation.ResourceRecord?.Value);
}
```

For DNS validation, sim ACM returns CNAME validation records for the primary domain and each subject
alternative name. The records are deterministic, which makes them suitable for assertions in tests.

For EMAIL validation, the validation method is recorded but no DNS resource record is returned.

```typescript sim-acm-email-validation
/**
 * Requesting a simulated ACM certificate with EMAIL validation.
 */

import {
  DescribeCertificateCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.acm();

const requestOutput = await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "mail.example.test",
    ValidationMethod: "EMAIL",
  }),
);

const describeOutput = await acm.describeCertificate(
  new DescribeCertificateCommand({
    CertificateArn: requestOutput.CertificateArn,
  }),
);

const validation = describeOutput.Certificate?.DomainValidationOptions?.[0];

console.log(validation?.ValidationMethod);
console.log(validation?.ResourceRecord);
```

## Certificate issuance and background tasks

Requested certificates are created in `PENDING_VALIDATION` status. Sim ACM schedules background work
to move them to `ISSUED`.

If your test needs the issued state, wait for simulator background tasks to complete.

```typescript sim-acm-background-issuance
/**
 * Waiting for a simulated ACM certificate to be issued.
 */

import {
  DescribeCertificateCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.acm();

const requestOutput = await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "issued.example.test",
  }),
);

await simAws.backgroundTasksComplete();

const describeOutput = await acm.describeCertificate(
  new DescribeCertificateCommand({
    CertificateArn: requestOutput.CertificateArn,
  }),
);

console.log(describeOutput.Certificate?.Status);
console.log(describeOutput.Certificate?.IssuedAt);
```

## Listing and filtering certificates

Use `ListCertificatesCommand` to inspect certificates in the selected simulated account and region.

```typescript sim-acm-list-certificates
/**
 * Listing simulated ACM certificates.
 */

import {
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.acm();

await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "one.example.test",
  }),
);

await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "two.example.test",
  }),
);

const listOutput = await acm.listCertificates(
  new ListCertificatesCommand({
    MaxItems: 10,
  }),
);

for (const summary of listOutput.CertificateSummaryList ?? []) {
  console.log(summary.CertificateArn);
  console.log(summary.DomainName);
  console.log(summary.Status);
}
```

Certificates are listed in creation order.
`MaxItems` must be between 1 and 1000 and defaults to 100. When more results are available, use
`NextToken` from the response in the next request.

You can filter by certificate status.

```typescript sim-acm-list-issued-certificates
/**
 * Filtering simulated ACM certificates by status.
 */

import {
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.acm();

await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "issued.example.test",
  }),
);

await simAws.backgroundTasksComplete();

const listOutput = await acm.listCertificates(
  new ListCertificatesCommand({
    CertificateStatuses: ["ISSUED"],
  }),
);

console.log(listOutput.CertificateSummaryList?.map((cert) => cert.DomainName));
```

## Tags

Pass `Tags` when requesting a certificate. Sim ACM accepts up to 50 tags, matching the ACM request
limit.

```typescript sim-acm-tags
/**
 * Requesting a simulated ACM certificate with tags.
 */

import { RequestCertificateCommand } from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const acm = simAws.acm();

await acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "tagged.example.test",
    Tags: [
      {
        Key: "Purpose",
        Value: "local-test",
      },
      {
        Key: "Owner",
        Value: "docs",
      },
    ],
  }),
);
```

Requests with more than 50 tags throw `TooManyTagsException`.

## Accounts and Regions

Use `SimAws` scopes to create ACM certificates in different simulated accounts and regions.

```typescript sim-acm-account-region-scoping
/**
 * Simulated ACM account and region scoping.
 */

import { RequestCertificateCommand } from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const defaultAcm = simAws.acm();
const euWest2Acm = simAws.region("eu-west-2").acm();
const accountAcm = simAws.account("111111111111").acm();
const scopedAcm = simAws.account("222222222222").region("ap-east-1").acm();

await defaultAcm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "default.example.test",
  }),
);

await euWest2Acm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "eu-west-2.example.test",
  }),
);

await accountAcm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "account.example.test",
  }),
);

await scopedAcm.requestCertificate(
  new RequestCertificateCommand({
    DomainName: "scoped.example.test",
  }),
);
```

ACM state is scoped to the selected simulated account and region. Certificates requested in one
scope do not appear in another scope.

Each `SimAws` instance has its own isolated state, so you can create a fresh instance per test or
share one across related local setup.

## CloudFormation certificates

Sim CloudFormation can create ACM certificates from `AWS::CertificateManager::Certificate`.

```typescript sim-acm-cloudformation-certificate
/**
 * Creating an ACM certificate through simulated CloudFormation.
 */

import {
  DescribeCertificateCommand,
  ListCertificatesCommand,
} from "@aws-sdk/client-acm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "acm-certificate-stack",
  template: {
    Resources: {
      SiteCertificate: {
        Type: "AWS::CertificateManager::Certificate",
        Properties: {
          DomainName: "example.test",
          SubjectAlternativeNames: ["www.example.test"],
          ValidationMethod: "DNS",
          DomainValidationOptions: [
            {
              DomainName: "example.test",
              ValidationDomain: "example.test",
            },
          ],
          Tags: [
            {
              Key: "Purpose",
              Value: "local-test",
            },
          ],
        },
      },
    },
    Outputs: {
      CertificateArn: {
        Value: {
          Ref: "SiteCertificate",
        },
      },
      CertificateStatus: {
        Value: {
          "Fn::GetAtt": ["SiteCertificate", "CertificateStatus"],
        },
      },
    },
  },
});

const certificateArn = stack.outputs.get("CertificateArn")?.value;
if (typeof certificateArn !== "string")
  throw new Error("No CertificateArn Output");

const listOutput = await simAws
  .acm()
  .listCertificates(new ListCertificatesCommand());

const describeOutput = await simAws.acm().describeCertificate(
  new DescribeCertificateCommand({
    CertificateArn: certificateArn,
  }),
);

console.log(stack.outputs.get("CertificateStatus")?.value);
console.log(listOutput.CertificateSummaryList?.[0]?.DomainName);
console.log(describeOutput.Certificate?.Status);
```

For `AWS::CertificateManager::Certificate`, `Ref` returns the certificate ARN. `Fn::GetAtt` supports
`CertificateArn` and `CertificateStatus`.

Supported certificate properties include:

- `DomainName`
- `SubjectAlternativeNames`
- `ValidationMethod`
- `DomainValidationOptions`
- `Tags`

## Limitations

Current documented limitations:

- Certificate deletion is not supported.
- Certificate renewal is not supported.
- Imported certificates are not supported.
- Real validation checks are not performed.
- DNS validation records are generated for test use; they are not resolvable through real DNS.
- ACM is not served as an HTTP API by `serveSimAws`.
