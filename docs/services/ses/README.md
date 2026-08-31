# Simulated SES

Yulin includes a simulated Amazon SES for tests and local development, through the SES v2 API. It
holds email identities, applies the sandbox rules, and keeps a record of every message it would have
sent. A test can assert that signing someone up produced a welcome email addressed to them, without
an AWS account and without a mailbox to read.

There is no delivery to simulate. A message SES accepts leaves AWS for a mail system. The whole of
the observable AWS behaviour is whether SES would have accepted the message and what it would have
sent. That is what makes this service small and what makes it useful.

SES specific types are imported from the `@kensio/yulin/ses` subpath.

## Asserting on a message that was sent

`sentEmails()` hands over the record. Each message carries who it was from, the three recipient
lists, the subject, the body, its attachments and the message id SES answered with.

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

Messages come back in the order they were sent, and the first message of a flow is the first one
read. The three recipient lists stay apart, leaving a test free to assert that a bcc was a bcc.
`recipients` gathers all three where it makes no difference which was which.

`body` keeps `text` and `html` apart too. A message sent with only an HTML body reports `undefined`
for its text, and never the markup.

### Asserting on an attachment

A simple message may carry structured attachments. The record keeps them in request order.
`rawContent` contains a copy of the bytes from the request, and the other fields contain the supplied
SES attachment metadata.

```typescript sim-ses-attachments
/**
 * Sending a generated CSV and reading it from the simulated SES record.
 */

import { SendEmailCommand } from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ses = simAws.sesV2();

ses.verifyIdentity("hello@example.com");
ses.verifyIdentity("someone@example.org");

const csv = new TextEncoder().encode("word,meaning\n你好,hello\n");

await ses.sendEmail(
  new SendEmailCommand({
    FromEmailAddress: "hello@example.com",
    Destination: { ToAddresses: ["someone@example.org"] },
    Content: {
      Simple: {
        Subject: { Data: "Your vocabulary backup" },
        Body: { Text: { Data: "Your backup is attached." } },
        Attachments: [
          {
            RawContent: csv,
            FileName: "vocabulary.csv",
            ContentType: "text/csv; charset=utf-8",
            ContentDisposition: "ATTACHMENT",
          },
        ],
      },
    },
  }),
);

const [email] = ses.sentEmails();
const [attachment] = email?.attachments ?? [];

// vocabulary.csv "word,meaning\n你好,hello\n"
console.log(
  attachment?.fileName,
  new TextDecoder().decode(attachment?.rawContent),
);
```

## Verifying identities

Real SES verifies an email address by emailing it a link and a domain by looking for DNS records.
Neither can happen inside a test process, so verification here is the simulator's own operation
instead of an API call. `verifyIdentity` performs it, creating the identity where one is absent.

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

Whether an identity is an address or a domain follows from whether the name has an `@` in it. That
is how SES itself decides, with no parameter saying which is meant.

A verified domain covers every address at it, the whole reason domain identities exist. Its
subdomains are a separate matter, and `example.com` leaves `orders@mail.example.com` uncovered, here
or on real SES. Domains match without regard to case. The local part of an address is
case-sensitive, per RFC 5321, so `Sales@example.com` and `sales@example.com` are two identities.

`unverify()` on an identity puts it back to `PENDING`, as a real one goes when the records that
proved it stop resolving. That gives a test somewhere to go when it wants to see sending fail after
it once worked.

## How an identity is configured

An identity holds the DKIM signing, custom MAIL FROM domain, feedback forwarding, configuration set
and tags it was created with, and `GetEmailIdentity` reads them back. The configuration set is the
one setting a send acts on, covered under
[Sending through a configuration set](#sending-through-a-configuration-set). The others are held and
reported. Each of them decides what happens to a message after it leaves AWS, where a test process
cannot watch.

A test can ask one question of it. Is the identity configured the way the stack said? That catches a
stack declaring DKIM wrongly, and a stack that stops declaring it.

```typescript sim-ses-identity-settings
/**
 * Asserting on the DKIM signing an identity was created with.
 */

import {
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
} from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const ses = new SimAws().sesV2();

await ses.createEmailIdentity(
  new CreateEmailIdentityCommand({
    EmailIdentity: "example.com",
    ConfigurationSetName: "transactional",
    Tags: [{ Key: "team", Value: "orders" }],
  }),
);

const identity = await ses.getEmailIdentity(
  new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
);

// true "AWS_SES" 3
console.log(
  identity.DkimAttributes?.SigningEnabled,
  identity.DkimAttributes?.SigningAttributesOrigin,
  identity.DkimAttributes?.Tokens?.length,
);

// "transactional" "orders"
console.log(identity.ConfigurationSetName, identity.Tags?.[0]?.Value);
```

Easy DKIM is on for a domain identity, as it is for one real SES creates through the v2 API, and its
three tokens are the ones `Fn::GetAtt` publishes. An email address identity gets no DKIM, since the
records carrying it belong to the domain rather than to one mailbox at it.
`DkimSigningAttributes.DomainSigningSelector` switches the origin to `EXTERNAL` and leaves the
identity with no tokens of its own, the way real SES answers for a key the caller brought. The
private key beside it is dropped, because holding a secret nothing signs with is worse than
forgetting it.

`DkimAttributes.Status` and `MailFromAttributes.MailFromDomainStatus` both follow the identity's own
verification. Real SES waits on separate DNS records for each, and `verifyIdentity` here stands for
all of them at once.

## Email templates

The assertion a test usually wants is "the welcome email went to this address, from this template,
with these substitutions". Asserting on the prose instead breaks whenever someone rewords it.
Storing the template in SES and sending from it by name is what makes the better assertion possible.

Templates are managed with `CreateEmailTemplate`, `GetEmailTemplate`, `UpdateEmailTemplate`,
`ListEmailTemplates` and `DeleteEmailTemplate`. A send carrying `Content.Template` renders the
stored wording against the JSON in `TemplateData`. The recorded send carries the template name and
the parsed data alongside the rendered result, leaving a test free to assert on either.

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

A message written out in full reports `undefined` for both, leaving a test able to tell the two
kinds of send apart.

### What the substitution does

Real SES renders templates with Handlebars, and this simulator renders the substitution part of it,
being `{{name}}` and dotted paths like `{{order.id}}`.

A placeholder naming something the data lacks renders as an empty string. That is what real SES
does, and it is much the commonest surprise in an SES template. The message goes out with a hole in
it and nothing reports a problem. Asserting on the rendered body is how that gets caught.

`{{name}}` HTML-escapes its value where `{{{name}}}` leaves it alone, again following Handlebars.
The escaping applies to the text part as well as the HTML one, because Handlebars renders a string
without knowing what it is for. A plain text email carrying an ampersand comes out with `&amp;` in
it.

Everything else Handlebars can do is refused where the template is written:

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

Refusing at the template is deliberate. It fails where the mistake is written, and a template
surviving into a sent message with `{{#if premium}}` still in it would make a test pass on a message
no real SES would produce.

`TemplateData` is checked only when a send carries it. Malformed JSON, or JSON that is anything but
an object, is refused. A send with no `TemplateData` at all is accepted and renders every
placeholder empty, as real SES treats it.

A send may name a stored template or write its wording out in `TemplateContent`, but not both.
Naming both is refused. Which of them real SES renders is beyond what this simulator knows, and
recording the message under a template it was not rendered from would be worse than failing.

## Configuration sets

A configuration set is a named group of settings a send can be made under. Suppression reasons, the
sending switch, the delivery options and the reputation switch are all declared on one. Simulated
SES holds a set as state. A test can then assert what a stack declared, with no AWS account to read
it back from.

A set is attached to an identity, or named on a send. `SendingEnabled` acts during acceptance.
Suppression options decide whether explicit bounce or complaint feedback adds the recipient to the
account suppression list. The rest are held for a test to read back.

```typescript sim-ses-configuration-sets
/**
 * Creating a configuration set and reading its settings back.
 */

import {
  CreateConfigurationSetCommand,
  GetConfigurationSetCommand,
} from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const ses = new SimAws().sesV2();

await ses.createConfigurationSet(
  new CreateConfigurationSetCommand({
    ConfigurationSetName: "transactional",
    SuppressionOptions: { SuppressedReasons: ["BOUNCE", "COMPLAINT"] },
    DeliveryOptions: { TlsPolicy: "REQUIRE" },
  }),
);

const read = await ses.getConfigurationSet(
  new GetConfigurationSetCommand({ ConfigurationSetName: "transactional" }),
);

// ["BOUNCE", "COMPLAINT"] true
console.log(
  read.SuppressionOptions?.SuppressedReasons,
  read.SendingOptions?.SendingEnabled,
);

// The simulator's own accessors, for a test that would rather skip a Command
// and its authorization.
const configurationSet = ses.findConfigurationSet("transactional");

// "REQUIRE"
console.log(configurationSet?.deliveryOptions.tlsPolicy);

// ["transactional"]
console.log(ses.allConfigurationSets().map((set) => set.configurationSetName));
```

A set declaring only its name gets the defaults real SES applies. Sending is on, TLS is optional,
reputation metrics are off and suppression falls back to the account reasons.
`GetConfigurationSet` reports the sending, delivery and reputation defaults. It leaves suppression
options absent where the set has no override.

An explicit empty override is different. `SuppressionOptions: { SuppressedReasons: [] }` disables
suppression for feedback on messages sent through that set. Simulated SES retains the empty list so
it does not fall back to the account reasons.

`findConfigurationSet` reaches one set by name and `allConfigurationSets` hands over every set in
the scope, oldest first.

### Sending through a configuration set

An identity carries a configuration set from `CreateEmailIdentity`, and `AWS::SES::EmailIdentity`
attaches one through `ConfigurationSetAttributes`. A send that names no set of its own goes through
the set its sending identity carries, and the recorded message names whichever set applied. A test
can then assert a message went through the right set without the code under test naming it at every
send.

A send that does name a set goes through that one. Where the sending address is an identity with a
set of its own and its domain is another, the address's set applies, as the more specific identity
does everywhere else here.

```typescript sim-ses-configuration-set-attachment
/**
 * Attaching a configuration set to an identity, and sending through it.
 */

import {
  CreateConfigurationSetCommand,
  CreateEmailIdentityCommand,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const ses = new SimAws().sesV2();

await ses.createConfigurationSet(
  new CreateConfigurationSetCommand({ ConfigurationSetName: "transactional" }),
);

await ses.createEmailIdentity(
  new CreateEmailIdentityCommand({
    EmailIdentity: "example.com",
    ConfigurationSetName: "transactional",
  }),
);

// Standing in for the DNS records a real domain identity waits on.
ses.verifyIdentity("example.com");
ses.verifyIdentity("someone@example.org");

await ses.sendEmail(
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

// "transactional", off the identity, with the send naming nothing.
console.log(ses.sentEmails()[0]?.configurationSetName);
```

A name that `CreateConfigurationSet` never created is accepted on both paths, and the record keeps
it. Real SES refuses one. Refusing here would fail a test over a set the developer left out of their
local setup. A test that wants the strict reading asks `findConfigurationSet` for the set and finds
nothing.

A set created with `SendingOptions.SendingEnabled` set to `false` refuses every send made through
it, with `SendingPausedException`. That switch is a declaration the developer wrote deliberately, and
a send through the set honours it. The refusal reaches a send that named the set and a send that
picked it up off its identity.

Sets are managed with `CreateConfigurationSet`, `GetConfigurationSet`, `ListConfigurationSets` and
`DeleteConfigurationSet`. There is no update. Real SES changes a set through a `Put` command per
group of options, and none of those is here yet. A set holds what it was created with.

`ListConfigurationSets` answers names alone, as real SES does. A caller after the settings reads one
set at a time.

`TrackingOptions` and `VdmOptions` are refused by name. Open and click tracking needs a redirect
domain and the events that report a click. The Virtual Deliverability Manager reports on engagement,
which this simulation never measures.

A set's suppression reasons override the account reasons when `recordFeedback` records a hard bounce
or complaint for a message sent through it. A set with no suppression options falls back to the
account reasons. The feedback entry goes onto the account suppression list.

`TlsPolicy` accepts `REQUIRE` and `OPTIONAL` and refuses anything else, and a `SuppressedReasons`
entry that is neither `BOUNCE` nor `COMPLAINT` is refused too. `MaxDeliverySeconds` takes whole
seconds from 300 to 50400, the five minutes to fourteen hours real SES attempts delivery for. A name
is letters, digits, dashes and underscores. All of it is validated in the command, so a template and
an SDK caller hear the same answer.

## Deploying SES resources with CloudFormation

`AWS::SES::EmailIdentity`, `AWS::SES::Template` and `AWS::SES::ConfigurationSet` deploy into
simulated SES. A project that declares them in CDK or CloudFormation can deploy the same template
its application deploys, with no hand-written test setup.

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

An identity deploys **unverified**. That is what a real deploy leaves behind, with the confirmation
link or the DKIM records still to be dealt with out of band. Verify it afterwards with
`verifyIdentity`, in that order. Verifying first and deploying second fails the deploy, because
CloudFormation is creating an identity that is already there.

`Ref` on an identity returns the address or domain itself, directly usable as a
`FromEmailAddress`. `Ref` on a template, and its `Id` attribute, both return the template name.
`Ref` on a configuration set returns its name. That Resource type has no `Fn::GetAtt` attributes at
all, so reading one fails the deploy rather than answering something AWS would not. A set with no
`Name` is named after the stack, the logical ID and a tail derived from both, as
[the CloudFormation docs](https://yulinsim.dev/services/cloudformation/#names-cloudformation-generates "Names CloudFormation generates")
describe.

Deleting the stack removes all three.

### DKIM tokens

`Fn::GetAtt` on an identity reads the six DKIM token attributes, and this simulator answers them
with tokens it made up. They are derived from the identity's own name, and come out the same on every
run. They are invented, and no message here is signed.

They exist because `ses.Identity.publicHostedZone()` in CDK emits three `AWS::Route53::RecordSet`
Resources reading exactly these attributes. Refusing them would take an ordinary CDK stack down over
records this simulation never reads. The stack deploys with records of the right shape and no
target.

### What an identity Resource carries

`EmailIdentity` names the identity. `DkimAttributes`, `DkimSigningAttributes`, `MailFromAttributes`,
`FeedbackAttributes`, `ConfigurationSetAttributes` and `Tags` are all held on the deployed identity
and read back by `GetEmailIdentity`, as described under
[How an identity is configured](#how-an-identity-is-configured). A stack that declares DKIM signing
can assert the identity it deployed is the one it described.

The settings land on the identity after it is created, which is the order real CloudFormation works
in. Two of them have no `CreateEmailIdentity` parameter on real SES either, and are put on the
identity by a separate call once it exists.

`DkimSigningAttributes.DomainSigningPrivateKey` is the one part dropped, and it turns up on
`stack.ignoredProperties` with the reason. A property this Resource type has no name for lands there
too, which in practice catches a misspelling. Real CloudFormation refuses a property it does not
recognise, and a stack failing over a property AWS added last week is a worse way to find out.

A template Resource has no such list, because everything `AWS::SES::Template` can usefully say is
wording and all of it is acted on. Anything else it says is still reported, at both levels. That
covers a property beside `Template`, and a part inside it that is none of the four. In practice it
catches a misspelling. `TextPart` written `Textpart` would otherwise send a message with no body and
no explanation for it.

A template carrying Handlebars this simulator leaves unrendered is a different matter, and fails the
deploy where it would otherwise sit in the stack waiting to fail at the first send.

### What a configuration set Resource is deployed without

`Name`, `SuppressionOptions`, `SendingOptions`, `DeliveryOptions` and `ReputationOptions` are acted
on. `TrackingOptions` and `VdmOptions` are recorded as ignored and the set is created without them. That
is the same split the identity Resource has. The SDK path refuses both by name, and a template
is a whole document one property should leave standing.

A set naming a suppression reason or a TLS policy SES has no meaning for does fail the deploy. The
Resource is created through `CreateConfigurationSet`. The validation is the command's, and there is
one answer whoever asked.

## The sandbox

An account starts in the SES sandbox, where **both** the sender and every recipient have to be
verified. That is the state most tests should be written against. It is the configuration that
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

A rejection names every identity that failed the check in one message, the way real SES does. A
caller finds out everything it has to verify from one failure:

```text
Email address is not verified. The following identities failed the check in region US-EAST-1: someone@example.org
```

Real SES treats `ProductionAccessEnabled` as a request that a human at AWS then reviews, and an
account stays in the sandbox until that review lands. Granting it immediately is a deliberate
divergence. The alternative is a simulator no test can get out of the sandbox in, and waiting for a
review is beyond what a test can assert on anyway.

## The suppression list

Real SES holds an account-level suppression list and fills it from hard bounces and complaints.
Tests supply that feedback explicitly with `recordFeedback`. Suppression commands manage the same
list. The support tool that lists suppressed addresses, the form that removes one and the script
that seeds the list all have somewhere to run.

`PutSuppressedDestination`, `GetSuppressedDestination`, `ListSuppressedDestinations` and
`DeleteSuppressedDestination` manage it.

```typescript sim-ses-suppression
/**
 * Suppressing an address, and what a send to it records.
 */

import {
  PutSuppressedDestinationCommand,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const ses = new SimAws().sesV2();

ses.verifyIdentity("hello@example.com");
ses.verifyIdentity("someone@example.org");

await ses.putSuppressedDestination(
  new PutSuppressedDestinationCommand({
    EmailAddress: "someone@example.org",
    Reason: "BOUNCE",
  }),
);

// SES accepts this and holds it back from the recipient.
await ses.sendEmail(
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

const [email] = ses.sentEmails();

// "someone@example.org" "BOUNCE" true
console.log(
  email?.suppressedRecipients[0]?.emailAddress,
  email?.suppressedRecipients[0]?.reason,
  email?.isFullySuppressed,
);
```

A send to a suppressed address is accepted. Real SES takes the message, holds it back from that
recipient, and counts it toward the daily sending quota. The send succeeds here too, and the record
carries the answer. `suppressedRecipients` names who was held back and why,
and `isFullySuppressed` is the narrower question of whether the message reached nobody. A message to
two recipients with one of them suppressed went to the other.

### Recording a hard bounce or complaint

`recordFeedback` takes the message id of an accepted message, one of its recipient addresses and a
`BOUNCE` or `COMPLAINT` reason. Active feedback adds or updates the account suppression entry at the
current simulated time. The existing suppression commands and `suppressedDestinations()` read the
result.

```typescript sim-ses-feedback-suppression
/**
 * Recording a hard bounce and observing the next send being suppressed.
 */

import { SendEmailCommand } from "@aws-sdk/client-sesv2";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-08-31T09:00:00.000Z")),
});
const ses = simAws.sesV2();

ses.verifyIdentity("hello@example.com");
ses.verifyIdentity("someone@example.org");

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

const accepted = await ses.sendEmail(message);

ses.recordFeedback({
  messageId: accepted.MessageId!,
  emailAddress: "someone@example.org",
  reason: "BOUNCE",
});

await ses.sendEmail(message);

const suppressed = ses.suppressedDestinations()[0];
const later = ses.sentEmails()[1];

// "BOUNCE" "2026-08-31T09:00:00.000Z" true
console.log(
  suppressed?.reason,
  suppressed?.lastUpdateTime.toISOString(),
  later?.isFullySuppressed,
);
```

The operation refuses a message id this SES scope did not issue and an address that was not a
recipient of that message. Recipient matching ignores case and a display name, while the suppression
entry keeps the address spelling from the accepted message.

Without a configuration-set override, the account's `SuppressedReasons` decide whether feedback is
active. A configuration set with suppression options replaces those reasons for messages sent
through it. An empty override leaves the suppression list unchanged.

`ListSuppressedDestinations` pages with `PageSize` and `NextToken`, and narrows with `Reasons`,
`StartDate` and `EndDate`. Removing an address that was never on the list succeeds, so a form that
removes one twice has no failure to handle.

### What the account is suppressing for

An address is held back only when the account is suppressing for the reason it was listed under. An
address on the list for `COMPLAINT`, on an account suppressing only `BOUNCE`, is mailed. That is
much the easiest part of the suppression rules to get wrong, and it is worth a test.

`PutAccountSuppressionAttributes` sets the reasons and `GetAccount` reports them as
`SuppressionAttributes`. An account here starts on both, where every real account opened after
November 2019 starts. Putting the attributes with no reasons at all turns the list off, which is
what the console's Enabled box does. The addresses stay on the list and SES stops reading it.

### Case, and the sandbox

Managing the list is case sensitive and sending is not, following real SES. `Someone@example.org` is
stored as written and `DeleteSuppressedDestination` needs that spelling to remove it, while a
message addressed to `SOMEONE@example.org` is held back by a listed `someone@example.org`.

Real SES refuses `PutSuppressedDestination` until an account leaves the sandbox. This one accepts it
either way. The sandbox is kept here so that a send to an unverified recipient fails the way it
would in an account, and making every test that seeds this list leave the sandbox first buys
nothing.

## Messages another service sends

A simulated Cognito user pool whose `EmailConfiguration` names `EmailSendingAccount: DEVELOPER`
sends its verification messages and invitations through the SES of the region its `SourceArn` names.
Those messages land in `sentEmails()` alongside the ones an SDK client sent, and the sandbox and
suppression rules above decide them the same way. See
[Sending a pool's email through SES](https://yulinsim.dev/services/cognito/#sending-a-pools-email-through-ses).

Such a send skips IAM. Real Cognito sends through a service-linked role rather than as whoever
called `SignUp`, so the permissions of that caller decide nothing about it. Nothing else about the
send differs. The sender is checked, the sandbox checks the recipient, and the message is
recorded.

## Messages on the console

`sentEmails()` is test code. A dev server has the same messages going past and nothing to read them
with, so `serveSimAws` prints a summary of each one as SES accepts it:

```
sim SES: hello@example.com to alice@example.com, bcc audit@example.com
  Subject: Reset your password
  Template: password-reset {"code":"483920"}
  Text body:
    Follow this link to reset your password.
    https://app.example.com/reset?token=abc123
  HTML body: 4.1 kB, not printed
```

The first line holds the sender and the three recipient lists, with an empty list left out. Under it
come the subject, the template the message was rendered from and the data it was filled with, and
the text part. An HTML part is measured and left out, because kilobytes of markup on the console
bury the rest of the block.

The text part is printed up to 2000 characters, and what runs past that is counted. Move the limit
with `emailTextLimit`, and turn the SES lines off with `ses: false`, both on the `messageLogging`
option. See [Messages on the console](https://yulinsim.dev/serve/#messages-on-the-console) for the rest of
it.

A user pool sending through SES prints twice, once for the SES send and once for the message the
pool kept. Both services recorded it, and each block says what that service holds. See
[Sending a pool's email through SES](https://yulinsim.dev/services/cognito/#sending-a-pools-email-through-ses).

## Permissions

Every command authorizes through simulated IAM. A send authorizes against the identity being sent
**from**, and recipients never enter into it. That is worth knowing when a policy looks like it
should cover a send and fails to.

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
on real SES, and only a policy written against `*` allows them. A policy scoped to identity ARNs
allows none of the three. Not even one written against `identity/*`, the intuitive reading and the
wrong one.

IAM is evaluated before the identity check, as it is on real AWS. A caller with no permission is
refused whether or not its identities are verified. The error a test sees says which of the two is
wrong.

## SDK interception

An intercepted `SESv2Client` reaches simulated SES, served in process:

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

The quota figures are the real sandbox and production ones, and both are reported without being
enforced. `SentLast24Hours` counts what was actually sent, on the simulated clock. A test that moves
time forward past the window sees the count fall the way an account's would.

## Simulated commands

| Command                           | Notes                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `SendEmail`                       | `Content.Simple`, including structured attachments, and `Content.Template`. Recorded rather than delivered. |
| `CreateEmailIdentity`             | Starts unverified. `Tags`, `DkimSigningAttributes` and `ConfigurationSetName` are held and reported back.   |
| `GetEmailIdentity`                | Reports the DKIM, MAIL FROM, feedback, configuration set and tag settings the identity holds.               |
| `ListEmailIdentities`             | Paged with `PageSize` and `NextToken`.                                                                      |
| `DeleteEmailIdentity`             |                                                                                                             |
| `CreateEmailTemplate`             | Substitution only. `Tags` are refused.                                                                      |
| `GetEmailTemplate`                | Reports the wording with its placeholders unrendered.                                                       |
| `UpdateEmailTemplate`             | Replaces the wording outright, keeping the creation time.                                                   |
| `ListEmailTemplates`              | Names and creation times only, paged.                                                                       |
| `DeleteEmailTemplate`             |                                                                                                             |
| `CreateConfigurationSet`          | `TrackingOptions`, `VdmOptions` and `Tags` are refused.                                                     |
| `GetConfigurationSet`             | Reports applied defaults and preserves whether suppression options were absent.                             |
| `ListConfigurationSets`           | Names only, paged with `PageSize` and `NextToken`.                                                          |
| `DeleteConfigurationSet`          |                                                                                                             |
| `GetAccount`                      | Reports `SuppressionAttributes` alongside the quota.                                                        |
| `PutAccountDetails`               | `MailType` and `WebsiteURL` are required, as on real SES.                                                   |
| `PutAccountSuppressionAttributes` | No reasons at all turns the suppression list off.                                                           |
| `PutSuppressedDestination`        | Accepted in the sandbox, which real SES refuses.                                                            |
| `GetSuppressedDestination`        |                                                                                                             |
| `ListSuppressedDestinations`      | Paged, and narrowed by `Reasons`, `StartDate` and `EndDate`.                                                |
| `DeleteSuppressedDestination`     | Removing an address that is not on the list succeeds.                                                       |

Anything else refuses on send with `SimSdkUnsupportedCommandError`.

## Divergences and limitations

- **Verification is a simulator call.** `verifyIdentity` has no counterpart on AWS. It is the only
  way an identity becomes verified here, because the real mechanisms are an emailed link and a DNS
  record.
- **Production access is granted on request.** Real SES has a human review it first.
- **Send quotas are reported, not enforced.** A send past the daily figure still succeeds, and
  a per-second rate would cost real time to respect.
- **`Content.Raw` is refused by name.** A raw MIME message would have to be parsed to say anything
  about its subject or body.
- **Only Handlebars substitution is rendered.** Block helpers, partials and comments are refused at
  the template. Template data holding an object where the template wants a value is refused too,
  where real Handlebars would render `[object Object]`.
- **`SendBulkEmail` is absent**, along with its per-recipient replacement data.
- **Nothing is delivered.** A test supplies a hard bounce or complaint through `recordFeedback`.
  Feedback is never generated automatically, and there are no event destinations.
- **A configuration set acts on one send.** `SendingEnabled` refuses a send made through the set.
  Suppression reasons act on explicit feedback. Delivery options and the reputation switch are held
  and read back.
- **A set name nothing created is still accepted.** Real SES refuses one on an identity and on a
  send. Both stand here and the name is recorded, because a test failing over a set missing from a
  local setup fails for a reason unrelated to what it asserts.
- **A configuration set holds what it was created with.** The `Put` commands that change one group
  of options are absent. A set cannot be changed once it exists.
- **Feedback is explicit.** Hard bounces and complaints update the suppression list only when a test
  calls `recordFeedback`. Soft bounces are absent.
- **Tenant-level suppression lists are left out.** A suppression command carrying `TenantName` is
  refused rather than answered from the account-level list.
- **`PutSuppressedDestination` works in the sandbox.** Real SES refuses it until an account has
  production access.
- **DKIM tokens are made up.** They are stable per identity so a test can assert on them, and they
  prove no ownership of anything.
- **Only `AWS::SES::EmailIdentity`, `AWS::SES::Template` and `AWS::SES::ConfigurationSet` deploy.**
  `AWS::SES::ConfigurationSetEventDestination`, `AWS::SES::ContactList`, `AWS::SES::ReceiptRule` and
  the rest are left out.
- **SES v2 only.** The older `@aws-sdk/client-ses` API is absent.
- **DKIM and MAIL FROM domains are recorded, never performed.** An identity reports the signing and
  envelope sender settings it was created with. No message is signed, no signature is checked, and
  no MX record is looked for. Deliverability is decided outside AWS, where a test process cannot
  follow.
- **The commands that change an identity's settings are absent.** `PutEmailIdentityDkimAttributes`,
  `PutEmailIdentityMailFromAttributes` and `PutEmailIdentityFeedbackAttributes` have no counterpart
  here. A CloudFormation deploy sets all three, and `CreateEmailIdentity` sets the rest.
- **Sending authorization policies are left out.** A Cognito user pool sending through an identity
  is checked only for that identity being verified, where real Cognito needs a policy on the
  identity allowing it as well.
