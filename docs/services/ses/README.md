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

## Email templates

The assertion a test usually wants is not "the email said this prose", which changes whenever
someone rewords it. It is "the welcome email went to this address, from this template, with these
substitutions". Storing the template in SES and sending from it by name is what makes that
assertion possible.

Templates are managed with `CreateEmailTemplate`, `GetEmailTemplate`, `UpdateEmailTemplate`,
`ListEmailTemplates` and `DeleteEmailTemplate`. A send carrying `Content.Template` renders the
stored wording against the JSON in `TemplateData`, and the recorded send carries the template name
and the parsed data alongside the rendered result, so a test can assert on either.

```typescript sim-ses-templates
/**
 * Sending from a stored template and asserting on the substitutions.
 */

import {
  CreateEmailTemplateCommand,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const ses = new SimAws().sesV2();

ses.verifyIdentity("hello@example.com");
ses.verifyIdentity("someone@example.org");

await ses.createEmailTemplate(
  new CreateEmailTemplateCommand({
    TemplateName: "welcome",
    TemplateContent: {
      Subject: "Welcome, {{name}}",
      Text: "Hi {{name}}, thanks for signing up.",
      Html: "<p>Hi {{name}}, thanks for signing up.</p>",
    },
  }),
);

await ses.sendEmail(
  new SendEmailCommand({
    FromEmailAddress: "hello@example.com",
    Destination: { ToAddresses: ["someone@example.org"] },
    Content: {
      Template: { TemplateName: "welcome", TemplateData: '{"name":"Ada"}' },
    },
  }),
);

const [email] = ses.sentEmails();

// "welcome" { name: "Ada" } "Welcome, Ada"
console.log(email?.templateName, email?.templateData, email?.subject);
```

A message written out in full reports `undefined` for both, so a test can tell the two kinds of send
apart.

### What the substitution does

Real SES renders templates with Handlebars, and this simulator renders the substitution part of it:
`{{name}}`, and dotted paths like `{{order.id}}`.

A placeholder naming something the data does not have renders as an empty string rather than
failing. That is what real SES does, and it is much the commonest surprise in an SES template: the
message goes out with a hole in it and nothing reports a problem. Asserting on the rendered body is
how that gets caught.

`{{name}}` HTML-escapes its value and `{{{name}}}` does not, again following Handlebars. The
escaping applies to the text part as well as the HTML one, because Handlebars renders a string
without knowing what it is for, so a plain text email carrying an ampersand comes out with
`&amp;` in it.

Everything else Handlebars can do is refused where the template is written, rather than left in
place:

```typescript sim-ses-template-refusals
/**
 * The Handlebars this simulator will not render, refused at the template.
 */

import { CreateEmailTemplateCommand } from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";
import { SimSesUnsupportedOperationException } from "@kensio/yulin/ses";

const ses = new SimAws().sesV2();

try {
  await ses.createEmailTemplate(
    new CreateEmailTemplateCommand({
      TemplateName: "welcome",
      TemplateContent: {
        Subject: "Welcome",
        Text: "{{#if premium}}Thanks for subscribing{{/if}}",
      },
    }),
  );
} catch (error) {
  // true: block helpers, partials and comments are not rendered here, and a
  // template carrying one is refused rather than sent with it still in place.
  console.log(error instanceof SimSesUnsupportedOperationException);
}
```

Refusing at the template rather than at the send is deliberate: it fails where the mistake is
written, and a template surviving into a sent message with `{{#if premium}}` still in it would make
a test pass on a message no real SES would produce.

`TemplateData` is checked only when a send carries it: malformed JSON, or JSON that is not an
object, is refused. A send with no `TemplateData` at all is accepted and renders every placeholder
empty, which is how real SES treats it.

A send may name a stored template or write its wording out in `TemplateContent`, but not both.
Naming both is refused, because which of them real SES renders is not something this simulator
knows, and recording the message under a template it was not rendered from would be worse than
failing.

## Deploying identities and templates with CloudFormation

`AWS::SES::EmailIdentity` and `AWS::SES::Template` deploy into simulated SES, so a project that
declares them in CDK or CloudFormation can deploy the same template its application deploys rather
than creating them by hand in test setup.

```typescript sim-ses-cloudformation
/**
 * Deploying an SES identity and template, then sending from them.
 */

import { SendEmailCommand } from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplate({
  stackName: "orders",
  template: {
    Resources: {
      SenderIdentity: {
        Type: "AWS::SES::EmailIdentity",
        Properties: { EmailIdentity: "example.com" },
      },
      WelcomeEmail: {
        Type: "AWS::SES::Template",
        Properties: {
          Template: {
            TemplateName: "welcome",
            SubjectPart: "Welcome, {{name}}",
            TextPart: "Hi {{name}}",
          },
        },
      },
    },
  },
});

const ses = simAws.sesV2();

// The stack leaves the identity unverified, as a real deploy does. Verifying
// finds the one the stack made rather than creating a second.
ses.verifyIdentity("example.com");
ses.verifyIdentity("example.org");

await ses.sendEmail(
  new SendEmailCommand({
    FromEmailAddress: "hello@example.com",
    Destination: { ToAddresses: ["someone@example.org"] },
    Content: {
      Template: { TemplateName: "welcome", TemplateData: '{"name":"Ada"}' },
    },
  }),
);

// "Welcome, Ada"
console.log(ses.sentEmails()[0]?.subject);
```

An identity deploys **unverified**. That is what a real deploy leaves behind: the confirmation link
or the DKIM records still have to be dealt with out of band. Verify it afterwards with
`verifyIdentity`, in that order: verifying first and deploying second fails the deploy, because
CloudFormation is creating an identity that is already there.

`Ref` on an identity returns the address or domain itself, which is directly usable as a
`FromEmailAddress`. `Ref` on a template, and its `Id` attribute, both return the template name.

Deleting the stack removes both.

### DKIM tokens

`Fn::GetAtt` on an identity reads the six DKIM token attributes, and this simulator answers them
with tokens it made up. They are derived from the identity's own name, so they are the same on every
run, and they are not real: nothing here signs a message.

They exist because `ses.Identity.publicHostedZone()` in CDK emits three `AWS::Route53::RecordSet`
Resources reading exactly these attributes. Refusing them would take an ordinary CDK stack down over
records nothing in this simulation reads, so the stack deploys with records of the right shape
pointing at nothing.

### What an identity Resource is deployed without

`EmailIdentity` is the only property acted on. `DkimAttributes`, `DkimSigningAttributes`,
`MailFromAttributes`, `FeedbackAttributes`, `ConfigurationSetAttributes` and `Tags` are recorded as
ignored and the identity is created without them, because an identity without any of them still does
the one thing an identity does here: exist to be verified, and let a send from it through.

`stack.ignoredProperties` is where they are reported, each with the reason it was not acted on, so
nothing is dropped in silence.

The SDK path is stricter on purpose. `CreateEmailIdentity` refuses `DkimSigningAttributes` outright,
because a caller reaching for it directly is asking for that behaviour and should be told it is not
there. A template is a whole document, and one property in it should not sink the deploy.

A template Resource has no such list, because everything `AWS::SES::Template` can usefully say is
wording and all of it is acted on. Anything else it says is still reported, at both levels: a
property beside `Template`, and a part inside it that is not one of the four. In practice that
catches a misspelling, which is worth catching, since `TextPart` written `Textpart` would otherwise
send a message with no body and nothing to explain it.

A template carrying Handlebars this simulator does not render is a different matter, and fails the
deploy rather than sitting in the stack waiting to fail at the first send.

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

```text
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

`ses:ListEmailIdentities`, `ses:GetAccount` and `ses:PutAccountDetails` have no resource type at all
on real SES, so only a policy written against `*` allows them. A policy scoped to identity ARNs
allows none of the three, not even one written against `identity/*`, which is the intuitive reading
and the wrong one.

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
| `SendEmail`           | `Content.Simple` and `Content.Template`. Recorded rather than delivered.                   |
| `CreateEmailIdentity` | Starts unverified. `Tags`, `DkimSigningAttributes` and `ConfigurationSetName` are refused. |
| `GetEmailIdentity`    |                                                                                            |
| `ListEmailIdentities` | Paged with `PageSize` and `NextToken`.                                                     |
| `DeleteEmailIdentity` |                                                                                            |
| `CreateEmailTemplate` | Substitution only. `Tags` are refused.                                                     |
| `GetEmailTemplate`    | Reports the wording with its placeholders unrendered.                                      |
| `UpdateEmailTemplate` | Replaces the wording outright, keeping the creation time.                                  |
| `ListEmailTemplates`  | Names and creation times only, paged.                                                      |
| `DeleteEmailTemplate` |                                                                                            |
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
- **`Content.Raw` is refused by name.** A raw MIME message would have to be parsed to say anything
  about its subject or body.
- **Only Handlebars substitution is rendered.** Block helpers, partials and comments are refused at
  the template. Template data holding an object where the template wants a value is refused too,
  rather than rendering `[object Object]` the way real Handlebars would.
- **`SendBulkEmail` is not simulated**, so there is no per-recipient replacement data.
- **Nothing is delivered, and nothing bounces.** There are no bounce or complaint events, no
  suppression list, no configuration sets and no event destinations. A configuration set named on a
  send is kept on the record so a test can assert the right one was used, and does nothing else.
- **DKIM tokens on `AWS::SES::EmailIdentity` are made up.** They are stable per identity so a test
  can assert on them, and they prove nothing.
- **Only `AWS::SES::EmailIdentity` and `AWS::SES::Template` deploy.** `AWS::SES::ConfigurationSet`,
  `AWS::SES::ContactList`, `AWS::SES::ReceiptRule` and the rest are not simulated.
- **SES v2 only.** The older `@aws-sdk/client-ses` API is not simulated.
- **DKIM, MAIL FROM domains and sending authorization policies are not simulated.** An identity
  created with `DkimSigningAttributes` is refused rather than reported as configured.
