# Simulated SES implementation

This directory contains the simulated Amazon SES implementation, through its v2 API. Email
identities, the sandbox rules, and a record of every message SES would have sent.

The guiding decision here is that there is nothing to deliver, and no delivery to build later
either. A message SES accepts leaves AWS for a mail system, so the whole of the observable AWS
behaviour is the decision of whether SES would have accepted it and a record of what it would have
sent. That record is what a test asserts on, and it is the point of the service.

## Entry points

- `sim-ses-v2.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public SES simulator API for `@kensio/yulin/ses`.

The class is `SimSesV2` rather than `SimSes`, matching simulated ELBv2 and API Gateway v2: it
answers the v2 API. The directory is `ses` rather than `sesv2` because the state is the service's
rather than the API version's. SES has an older API over the same identities and the same account,
and if that is ever simulated it belongs beside this and shares the stores, not in a directory of
its own.

A `SimSesV2` owns a `SimSesIdentityStore`, a `SimSesSentEmailStore` and a `SimSesAccount`. All three
are region scoped because real SES state is: verifying an address in one region verifies nothing in
another, and the sandbox is a per-region condition.

## Identity model

Identity state lives under `identity/`.

`SimSesIdentity` is the stored resource: the address or domain, its type, its ARN and how far its
verification has got. An identity starts `PENDING` and only a simulator-side call moves it to
`SUCCESS`. That is the one deliberate divergence from AWS in this service, and an unavoidable one:
real SES verifies an address by emailing it a link and a domain by looking for DNS records, and
neither can happen inside a test process. `SimSesV2.verifyIdentity` is where a test performs it, and
it creates the identity if it is not already there, because verifying is what setting up a mailbox
in a test actually means.

Which kind an identity is follows from whether the name has an `@` in it, exactly as SES decides it:
there is no parameter saying which is meant. `simSesIdentityKey` is how two spellings of the same
thing meet. Domains are keyed in lower case because they are case insensitive; the local part of an
address is kept as given because per RFC 5321 it is not, so `Sales@example.com` and
`sales@example.com` are two identities here.

`SimSesIdentityStore.covering` and `SimSesIdentityStore.isAddressVerified` answer two different
questions about the same address and are deliberately not the same function.

- `covering` picks the identity IAM authorizes an operation against, and the more specific of the
  two wins: an address identity over a domain one. A policy naming `identity/hello@example.com`
  covers a send from that address; one naming `identity/example.com` covers a send from any address
  at the domain, unless the address is an identity in its own right.
- `isAddressVerified` asks whether either will do, because either will: an address identity still
  waiting on its link sends anyway once its domain is verified.

Neither treats a parent domain as covering a subdomain, here or on real SES.

## Sending

Send state lives under `email/`, and the command under `command/send/`.

`SimSesSendEmail` decides a request in the order real SES does: IAM first, then the identity check,
then the message is recorded. A caller with no permission is therefore refused whether or not its
identities are verified, which is worth keeping in that order because the error a test sees says
which of the two is wrong.

`SimSesVerifiedIdentityCheck` holds both sandbox rules. The sender is checked in the sandbox and out
of it, because SES will not send from an address nobody has proved they own. Recipients are checked
only in the sandbox, and that is what the sandbox is actually for. Failures are gathered rather than
reported one at a time, because real SES names every identity that failed in a single message.

`SimSesSentEmail` is what the record keeps. The three recipient lists stay three lists so a test
asserting a bcc was a bcc still can, and the body keeps text and HTML apart so a test asserting on
the text of an HTML-only message finds nothing rather than the markup.

`SimSesContentReader` dispatches the three kinds of content. `Simple` and `Template` are both read;
`Raw` is refused by name, since a raw MIME message would have to be parsed to say anything about its
subject or body and a recorded message with nothing in it would make a test pass for a reason
unrelated to what it asserts.

## Configuration set model

Configuration set state lives under `configuration-set/`, and the send-side resolution under
`command/send/sim-ses-configuration-set-check.ts`.

`SimSesConfigurationSet` holds the suppression reasons, the sending switch, the delivery options and
the reputation options a set was created with. The sending switch is the only one of them a send
acts on. The others have nothing here to act on, because no message is delivered and no bounce is
recorded.

`SimSesConfigurationSetCheck` answers two questions about a send. Which set it goes through, and
whether that set will carry it. The set is the one the send names, or the one the sending identity
was created with. `SimSesIdentityStore.covering` picks the identity, giving an address's own set precedence over its
domain's. That is the precedence IAM authorizes an address under.

A name no `CreateConfigurationSet` created is accepted and recorded. Real SES refuses one, and
refusing here would fail a test over a set the developer left out of their local setup.
`SimSesV2.findConfigurationSet` is where a test wanting the strict reading goes.

Both send paths go through the check. `SimSesSendEmail` throws `SimSesSendingPausedException`, and
`SimSesServiceSend` hands the reason back for the calling service to report in its own vocabulary.

## Template model

Template state lives under `template/`, and the send-side rendering under `command/send/`.

`SimSesTemplate` holds the wording with its placeholders still in it. That separation is the reason
templates are worth having in a simulator at all: a test can assert which template went out and what
was substituted into it, rather than matching against rendered prose that changes whenever someone
rewords the email. `SimSesSentEmail` therefore carries `templateName` and `templateData` as well as
the rendered result.

`sim-ses-render.ts` does the substitution. Real SES renders with Handlebars and this renders the
substitution part of it: `{{name}}`, dotted paths, `{{{name}}}` for an unescaped value, and HTML
escaping otherwise. Two decisions in there are worth knowing about.

Escaping is applied to the text part as well as the HTML one, because Handlebars escapes without
knowing what the string is for. If that turns out not to match real SES it is a one-line change, and
the direction was chosen on which way round the error is cheaper: escaping when SES does not gives a
test that fails for a visible, documented reason, while not escaping when SES does gives a test that
passes on a message that would go out with `&lt;b&gt;` in it.

A value that is not a string, number or boolean is refused rather than rendered. Real Handlebars
would put `[object Object]` in the message, which nobody means to send, so naming the placeholder is
more use than reproducing it.

`readSimSesTemplateContent` refuses everything Handlebars can do beyond substitution, and it does so
at `CreateEmailTemplate` and `UpdateEmailTemplate` rather than at the send. That fails where the
mistake is written, and follows the house pattern of refusing an unsimulated input at the command
that carries it.

## CloudFormation model

Resource creation lives under `cfn/`, and the CloudFormation-facing Ref and GetAtt values under
`src/service/cloudformation/resource/cfn/ses/`, beside every other service's.

Both Resource types go through the ordinary SES commands rather than constructing state directly, so
one a stack deployed is the same thing an SDK caller would have got, and a template carrying
unrenderable Handlebars fails the deploy rather than sitting in the stack waiting to fail at the
first send.

An identity Resource reads every property it has. `DkimAttributes`, `MailFromAttributes` and the
rest become a `SimSesIdentitySettings` the identity holds and `GetEmailIdentity` reads back. A stack
declaring DKIM signing then has something local to assert against. All of it is held and
reported, and a send behaves the same either way.

`sim-cfn-ses-identity-settings.ts` does the reading and `sim-cfn-ses-identity-values.ts` holds the
lenient readers under it. A malformed value falls back to the default and the deploy stands, which
is the call the rest of the Resource makes too.

A template Resource has no settings of that kind. Everything it can say is wording, and wording it
cannot render is a real failure.

`sim-ses-dkim-tokens.ts` under `identity/` is the one piece of invention. `Fn::GetAtt` on an identity
reads six DKIM tokens and `GetEmailIdentity` reports three, and there is no key here to derive one
from, so they are hashed from the identity name: stable per identity, and meaningless. Refusing them
was the first thing tried and is the wrong answer, because `ses.Identity.publicHostedZone()` in CDK
emits three Route53 record sets reading exactly those attributes, so refusing takes an ordinary
stack down over records nothing reads.

The settings land on the identity after `CreateEmailIdentity` has made it, through `configure()`.
Real SES puts them there with `PutEmailIdentityDkimAttributes` and the two commands beside it, and
real CloudFormation makes those calls itself. Those three commands are absent here. `configure()` is
what a deploy reaches in their place.

## Account model

Account state lives under `account/`.

`SimSesAccount` starts in the sandbox, which is where every real account starts and the state most
tests should be written against. `PutAccountDetails` with `ProductionAccessEnabled` leaves it. Real
SES treats that as a request a human at AWS then reviews, and granting it immediately is the
divergence worth taking: the alternative is a simulator no test can get out of the sandbox in, and
waiting for a review is not behaviour a test can assert on anyway.

Neither send quota is enforced. Simulating the daily cap would mean a suite that sent two hundred
messages started failing for a reason unrelated to what it asserts, and simulating the per-second
rate would mean tests that take real time to run. The numbers `GetAccount` reports are the real
sandbox and production ones, and `SentLast24Hours` counts what was actually sent, on the simulated
clock, so moving time forward past the window drops the count the way an account's would.
