# Simulated SES

Yulin includes a simulated Amazon SES for tests and local development, through the SES v2 API. It
holds email identities, applies the sandbox rules, and keeps a record of every message it would have
sent, so a test can assert that signing someone up produced a welcome email addressed to them,
without an AWS account and without a mailbox to read.

There is no delivery to simulate. A message SES accepts leaves AWS for a mail system, so the whole
of the observable AWS behaviour is whether SES would have accepted the message and what it would
have sent. That is what makes this service small and what makes it useful.

SES specific types are imported from the `@kensio/yulin/ses` subpath.

## Asserting on a message that was sent

`sentEmails()` hands over the record. Each message carries who it was from, the three recipient
lists, the subject, the body and the message id SES answered with.

```typescript sim-ses-send-and-assert
/**
 * Sending a welcome email through simulated SES and asserting on it.
 */

import { SendEmailCommand } from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ses = simAws.sesV2();

// Both ends have to be verified in the sandbox, which is where an account
// starts.
ses.verifyIdentity("hello@example.com");
ses.verifyIdentity("someone@example.org");

await ses.sendEmail(
  new SendEmailCommand({
    FromEmailAddress: "hello@example.com",
    Destination: { ToAddresses: ["someone@example.org"] },
    Content: {
      Simple: {
        Subject: { Data: "Welcome" },
        Body: { Text: { Data: "Hi there, thanks for signing up." } },
      },
    },
  }),
);

const [email] = ses.sentEmails();

// "Welcome" someone@example.org
console.log(email?.subject, email?.destination.toAddresses[0]);
```

Messages come back in the order they were sent, so the first message of a flow is the first one
read. The three recipient lists stay apart, so a test asserting a bcc was a bcc still can, and
`recipients` gathers all three when it does not matter which was which.

`body` keeps `text` and `html` apart too. A message sent with only an HTML body reports `undefined`
for its text rather than handing back the markup.

## Verifying identities

Real SES verifies an email address by emailing it a link and a domain by looking for DNS records.
Neither can happen inside a test process, so verification here is the simulator's own operation
rather than an API call. `verifyIdentity` performs it, creating the identity if it is not already
there.

Everything else about identities is the ordinary SES API. `CreateEmailIdentity` starts one, and it
starts unverified, exactly as a real one does:

```typescript sim-ses-identities
/**
 * Creating an email identity, and verifying it the way only a simulator can.
 */

import {
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
} from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const ses = new SimAws().sesV2();

await ses.createEmailIdentity(
  new CreateEmailIdentityCommand({ EmailIdentity: "example.com" }),
);

const pending = await ses.getEmailIdentity(
  new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
);

// "DOMAIN" "PENDING" false
console.log(
  pending.IdentityType,
  pending.VerificationStatus,
  pending.VerifiedForSendingStatus,
);

// Standing in for the DNS records a real domain identity waits on.
ses.verifyIdentity("example.com");

const verified = await ses.getEmailIdentity(
  new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
);

// "SUCCESS" true
console.log(verified.VerificationStatus, verified.VerifiedForSendingStatus);
```

Whether an identity is an address or a domain follows from whether the name has an `@` in it, which
is how SES itself decides: there is no parameter saying which is meant.

A verified domain covers every address at it, which is the whole reason domain identities exist. It
does not cover a subdomain: `example.com` does nothing for `orders@mail.example.com`, here or on
real SES. Domains match without regard to case; the local part of an address does not, per RFC 5321,
so `Sales@example.com` and `sales@example.com` are two identities.

`unverify()` on an identity puts it back to `PENDING`, which is what a real one does when the
records that proved it stop resolving. That gives a test somewhere to go when it wants to see
sending fail after it once worked.

## The sandbox

An account starts in the SES sandbox, where **both** the sender and every recipient have to be
verified. That is the state most tests should be written against: it is the configuration that
refuses to mail an address nobody verified, and catching that refusal in a test is much better than
catching it in an account.

Outside the sandbox only the sender is checked. `PutAccountDetails` with `ProductionAccessEnabled`
is how an account gets there:

```typescript sim-ses-sandbox
/**
 * The sandbox rules, and leaving the sandbox.
 */

import {
  PutAccountDetailsCommand,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";
import { SimSesMessageRejected } from "@kensio/yulin/ses";

const ses = new SimAws().sesV2();

ses.verifyIdentity("hello@example.com");

const message = new SendEmailCommand({
  FromEmailAddress: "hello@example.com",
  Destination: { ToAddresses: ["someone@example.org"] },
  Content: {
    Simple: {
      Subject: { Data: "Welcome" },
      Body: { Text: { Data: "Hi there" } },
    },
  },
});

try {
  await ses.sendEmail(message);
} catch (error) {
  // MessageRejected: the recipient is not verified and this account is still
  // in the sandbox.
  console.log(error instanceof SimSesMessageRejected, ses.isInSandbox());
}

await ses.putAccountDetails(
  new PutAccountDetailsCommand({
    MailType: "TRANSACTIONAL",
    WebsiteURL: "https://example.com",
    ProductionAccessEnabled: true,
  }),
);

await ses.sendEmail(message);

// 1
console.log(ses.sentEmails().length);
```

A rejection names every identity that failed the check in one message, the way real SES does, so a
caller finds out everything it has to verify from one failure rather than several:

```
Email address is not verified. The following identities failed the check in region US-EAST-1: someone@example.org
```

Real SES treats `ProductionAccessEnabled` as a request that a human at AWS then reviews, so an
account does not leave the sandbox the moment the call returns. Granting it immediately is a
deliberate divergence: the alternative is a simulator no test can get out of the sandbox in, and
waiting for a review is not behaviour a test can assert on anyway.

## Permissions

Every command authorizes through simulated IAM. A send authorizes against the identity being sent
**from**; recipients never enter into it, which is worth knowing when a policy looks like it should
cover a send and does not.

```typescript sim-ses-permissions
/**
 * A Role that may only send from one domain.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "111111111111" });
const ses = simAws.sesV2();

ses.verifyIdentity("example.com");

await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "SignUpFunctionRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "SignUpFunctionRole",
    PolicyName: "SendWelcomeEmail",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "ses:SendEmail",
          Resource: "arn:aws:ses:us-east-1:111111111111:identity/example.com",
        },
      ],
    }),
  }),
);

await ses.sendEmail(
  new SendEmailCommand({
    FromEmailAddress: "anything@example.com",
    Destination: { ToAddresses: ["someone@example.com"] },
    Content: {
      Simple: {
        Subject: { Data: "Welcome" },
        Body: { Text: { Data: "Hi there" } },
      },
    },
  }),
  {
    caller: {
      kind: "arn",
      arn: "arn:aws:iam::111111111111:role/SignUpFunctionRole",
    },
  },
);

// 1
console.log(ses.sentEmails().length);
```

The more specific identity wins when both exist. A policy naming `identity/example.com` covers a
send from any address at the domain, unless that address is an identity in its own right, in which
case the send authorizes against `identity/hello@example.com` instead.

`ses:ListEmailIdentities` reaches every identity in the account and region, so it authorizes against
`identity/*` and a policy naming one identity does not allow it. `ses:GetAccount` and
`ses:PutAccountDetails` have no resource type at all on real SES, so only a policy written against
`*` allows them.

IAM is evaluated before the identity check, as it is on real AWS. A caller with no permission is
refused whether or not its identities are verified, which means the error a test sees says which of
the two is wrong.

## SDK interception

An intercepted `SESv2Client` reaches simulated SES with nothing touching the network:

```typescript sim-ses-sdk-interception
/**
 * Application code sending through an intercepted SES client.
 */

import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();
simSdk.intercept(SESv2Client);

const scoped = simSdk.simAws.accountRegionScope(
  simSdk.simAws.defaultAccountId,
  "eu-west-2",
);

scoped.sesV2().verifyIdentity("example.com");
scoped.sesV2().verifyIdentity("example.org");

// Ordinary application code, unaware it is not talking to AWS.
const client = new SESv2Client({ region: "eu-west-2" });

await client.send(
  new SendEmailCommand({
    FromEmailAddress: "hello@example.com",
    Destination: { ToAddresses: ["someone@example.org"] },
    Content: {
      Simple: {
        Subject: { Data: "Welcome" },
        Body: { Text: { Data: "Hi there" } },
      },
    },
  }),
);

// "Welcome"
console.log(scoped.sesV2().sentEmails()[0]?.subject);
```

## Reading the account

`GetAccount` reports whether the account has production access and what it may send:

```typescript sim-ses-account
/**
 * Reading the sandbox state and the sending limits.
 */

import { GetAccountCommand } from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const account = await new SimAws()
  .sesV2()
  .getAccount(new GetAccountCommand({}));

// false 200 1
console.log(
  account.ProductionAccessEnabled,
  account.SendQuota?.Max24HourSend,
  account.SendQuota?.MaxSendRate,
);
```

The quota figures are the real sandbox and production ones, and neither is enforced. `SentLast24Hours`
counts what was actually sent, on the simulated clock, so a test that moves time forward past the
window sees the count fall the way an account's would.

## Simulated commands

| Command               | Notes                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `SendEmail`           | `Content.Simple` only. Recorded rather than delivered.                                     |
| `CreateEmailIdentity` | Starts unverified. `Tags`, `DkimSigningAttributes` and `ConfigurationSetName` are refused. |
| `GetEmailIdentity`    |                                                                                            |
| `ListEmailIdentities` | Paged with `PageSize` and `NextToken`.                                                     |
| `DeleteEmailIdentity` |                                                                                            |
| `GetAccount`          |                                                                                            |
| `PutAccountDetails`   | `MailType` and `WebsiteURL` are required, as on real SES.                                  |

Anything else refuses on send with `SimSdkUnsupportedCommandError` rather than misbehaving quietly.

## Divergences and limitations

- **Verification is a simulator call.** `verifyIdentity` has no counterpart on AWS. It is the only
  way an identity becomes verified here, because the real mechanisms are an emailed link and a DNS
  record.
- **Production access is granted on request.** Real SES has a human review it first.
- **Send quotas are reported, not enforced.** A send past the daily figure still succeeds, and
  nothing here takes real time to respect a per-second rate.
- **Only `Content.Simple` is read.** `Content.Raw` and `Content.Template` are refused by name.
  Templates are a separate piece of work.
- **Nothing is delivered, and nothing bounces.** There are no bounce or complaint events, no
  suppression list, no configuration sets and no event destinations. A configuration set named on a
  send is kept on the record so a test can assert the right one was used, and does nothing else.
- **No `AWS::SES::*` CloudFormation resources yet.** Identities have to be created through the API
  or through `verifyIdentity`.
- **SES v2 only.** The older `@aws-sdk/client-ses` API is not simulated.
- **DKIM, MAIL FROM domains and sending authorization policies are not simulated.** An identity
  created with `DkimSigningAttributes` is refused rather than reported as configured.
