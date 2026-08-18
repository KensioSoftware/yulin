# Serving simulated AWS on localhost

Serving puts a simulated AWS environment behind a real port. A browser, `curl` or an SDK client then
reaches it over HTTP. The same request path is also available in the process with no port at all,
which is the form a test usually wants.

## Serving a port

`serveSimAws` starts the server and returns once it is listening:

```typescript sim-serve-localhost
/**
 * Serving a simulated environment on a port of your choosing.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 8787 });

console.log(srv.port); // "8787"

await srv.close();
```

Without a `port` the server takes whatever port is free, which changes on every run. Pin one when
the URL needs to stay the same, such as when a browser is pointed at it.

A URL from a simulated service points at a simulated hostname on its usual port, and needs adapting
before it can be fetched. `srv.localUrl(...)` swaps in the port the server took:

```typescript sim-serve-local-url
/**
 * Turning a simulated AWS URL into one that reaches the local server.
 */

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "foo-site" }));

const websiteUrl = simAws.s3().getBucketWebsiteUrl("foo-site");
console.log(srv.localUrl(websiteUrl).toString());
// http://foo-site.s3-website.us-east-1.sim-aws.localhost:<srv.port>/
// with whatever port this run took, since none was pinned.

await srv.close();
```

## Requests without a port

`SimAwsHttp` is the same request path with no socket under it. It takes a Fetch API `Request` and
answers with a `Response`, in the process that built the environment:

```typescript sim-serve-in-process-request
/**
 * Requesting a simulated S3 website with no server listening.
 */

import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutBucketWebsiteCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { SimAwsHttp } from "@kensio/yulin/serve";

const simAws = new SimAws();
const simAwsHttp = new SimAwsHttp({ simAws });
const simS3 = simAws.region("eu-west-2").s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "foo-site" }));
await simS3.putObject(
  new PutObjectCommand({
    Bucket: "foo-site",
    Key: "index.html",
    Body: "<h1>Hello, world!</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);
await simS3.putBucketWebsite(
  new PutBucketWebsiteCommand({
    Bucket: "foo-site",
    WebsiteConfiguration: {
      IndexDocument: {
        Suffix: "index.html",
      },
    },
  }),
);

// A website endpoint serves only what the Bucket policy makes readable, and a
// public policy needs the Block Public Access opt-out first.
await simS3.putPublicAccessBlock(
  new PutPublicAccessBlockCommand({
    Bucket: "foo-site",
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
    },
  }),
);
await simS3.putBucketPolicy(
  new PutBucketPolicyCommand({
    Bucket: "foo-site",
    Policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::foo-site/*",
      },
    }),
  }),
);

const response = await simAwsHttp.fetch(simS3.getBucketWebsiteUrl("foo-site"));

console.log(response.status); // 200
console.log(await response.text()); // <h1>Hello, world!</h1>
```

`fetch(input, init)` takes what the global `fetch` takes. `handleRequest(request)` takes a `Request`
that is already built, for a caller that is holding one.

With no port bound there is no URL to adapt. The website URL above is fetched as it is, where a
served environment needs `srv.localUrl(...)` to add the port it took. A hostname a simulated Route53
answers for is requested by its own name. A Distribution behind `www.example.com` is reached at
`https://www.example.com/`. An `https` URL needs no certificate set up for it, since there is no
connection to encrypt.

There is also no server to close, though `simAws.close()` still lets go of what the environment
itself is holding, such as a watched template file. See
[stopping and restarting](#stopping-and-restarting).

Live reload sits either side of this interface, outside it. A response from here never carries the
injected script, even in a process that served one elsewhere with live reload on.

Which to reach for:

- `SimAwsHttp` for tests, and for anything else in the same process. Test files that run in parallel
  have no port to collide over. With no socket listening there is no teardown to get wrong, and no
  connection between the request and the service answering it.
- `serveSimAws` for anything outside the process, such as a browser, `curl`, or an SDK client
  pointed at a local endpoint.

Both go through the same authentication, routing and service code. A request answered one way is
answered the same way the other.

## Pointing an AWS SDK or the CLI at the simulation

A served environment answers the general AWS service APIs on the same port it serves everything else. Give any AWS SDK, in any language, the server's own URL as its endpoint and it reaches the simulation.

```typescript sim-serve-aws-api-endpoint
/**
 * Reaching simulated DynamoDB with an ordinary SDK client over a port.
 */

import {
  CreateTableCommand,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "widgets",
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);

// A served request is authorized as whoever signed it, so the client needs
// credentials simulated IAM issued.
const simIam = simAws.iam();
await simIam.createUser(new CreateUserCommand({ UserName: "Widgets" }));
await simIam.putUserPolicy(
  new PutUserPolicyCommand({
    UserName: "Widgets",
    PolicyName: "WriteWidgets",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "dynamodb:*", Resource: "*" },
    }),
  }),
);
const created = await simIam.createAccessKey(
  new CreateAccessKeyCommand({ UserName: "Widgets" }),
);

const srv = await serveSimAws({ simAws, port: 8787 });

const client = new DynamoDBClient({
  region: simAws.defaultRegionName,
  endpoint: `http://localhost:${srv.port}`,
  credentials: {
    accessKeyId: created.AccessKey.AccessKeyId,
    secretAccessKey: created.AccessKey.SecretAccessKey,
  },
});

await client.send(
  new PutItemCommand({
    TableName: "widgets",
    Item: { id: { S: "w1" } },
  }),
);

await srv.close();
```

One endpoint URL covers every service. A client sends `Host: localhost:<port>` whichever service it is talking to, which leaves no hostname to route on. Routing is on the service and Region named in the request's SigV4 credential scope, and a client cannot change either without invalidating its signature.

The same URL works for anything that speaks the AWS APIs, which includes the real `aws` CLI:

```bash
export AWS_ENDPOINT_URL=http://localhost:8787
export AWS_ACCESS_KEY_ID=<key from simulated IAM>
export AWS_SECRET_ACCESS_KEY=<secret from simulated IAM>
aws dynamodb put-item --table-name widgets --item '{"id":{"S":"w1"}}'
```

### Who a served request is

Whoever signed it. The endpoint verifies the signature against simulated IAM and runs the operation as the principal behind the access key. An IAM policy applies exactly as it does in process, and an assumed-role session is authorized against the Role behind it.

A request carrying no signature is anonymous and reaches nothing. In process an omitted caller means "whoever owns this simulation", and over a port the same default would hand administrator rights to anyone who could reach it.

### Which services answer

S3, STS, and the services that speak the AWS JSON protocol. Those are DynamoDB, DynamoDB Streams, SQS, Cognito Identity Provider, EventBridge, ECS, SSM, ACM, CloudWatch, CloudWatch Logs, KMS, Secrets Manager and Rekognition.

A request to any other service is refused with `501 Not Implemented` and a body saying why. Every service is reachable in process through `SimAws` and through [SDK interception](../sdk/README.md), whether or not it answers here.

CloudWatch's windowed reads, `GetMetricStatistics` and `GetMetricData`, are the exception among the operations those services implement. The JSON protocol carries a timestamp as epoch seconds, and the endpoint passes that number through as it arrives. The simulation is handed a number where it expects a date. Both reads answer in process and through SDK interception.

### Checking who the simulator thinks you are

`sts get-caller-identity` reports the principal behind the credentials that signed the request, which is the quickest way to confirm an endpoint and a set of credentials are wired up as expected:

```bash
export AWS_ENDPOINT_URL=http://localhost:8787
aws sts get-caller-identity
{
    "UserId": "AIDAM7J2TJYHV8BHEVIO",
    "Account": "888888888888",
    "Arn": "arn:aws:iam::888888888888:user/Widgets"
}
```

An assumed-role session reports its own session ARN, as it does in real AWS, and its user id joins the Role's id to the session name. A caller with no identity is refused, since there is nothing to answer with.

`GetCallerIdentity` is the only STS operation served. `AssumeRole` works in process and through SDK interception.

### S3 over the endpoint

`aws s3` and an `S3Client` reach simulated S3 through the same endpoint URL:

```bash
export AWS_ENDPOINT_URL=http://localhost:8787
aws s3api create-bucket --bucket widgets
aws s3api put-object --bucket widgets --key one.txt --body ./one.txt
aws s3 ls s3://widgets/
```

An SDK client needs `forcePathStyle`, because a virtual-host request puts the Bucket in the hostname and this endpoint routes on the credential scope rather than the host:

```typescript
const client = new S3Client({
  region: "us-east-1",
  endpoint: `http://localhost:${srv.port}`,
  forcePathStyle: true,
  credentials,
});
```

The operations served are the ones simulated S3 implements: `CreateBucket`, `DeleteBucket`, `HeadBucket`, `ListBuckets`, `ListObjects`, `ListObjectsV2`, `GetObject`, `HeadObject`, `PutObject`, `DeleteObject`, `DeleteObjects`, the six multipart upload operations, and the Bucket policy, website, Block Public Access and event notification configurations. `aws s3 cp` works in both directions, and for a file above the CLI's 8MB multipart threshold. Anything else is refused as `NotImplemented`, which an SDK raises under that name rather than leaving a client to guess.

Simulated S3 also answers its own Bucket hostnames, covered above. That path is unchanged, and it is what a presigned URL and a website visitor use.

## Stopping and restarting

`close()` stops serving and lets go of everything Yulin was holding, leaving the process free to
exit. That is the HTTP port, the DNS port and the connections the server is holding, along with the
simulated environment it was serving with them. The environment covers the template files a
deployment is [watching](../services/cloudformation/README.md#watching-a-template-file) and the
directories a [mount](../services/s3/README.md#reloading-the-browser-when-the-directory-changes) is
watching, in whichever Account and Region each of them lives in. One call covers all of it. A script
that hangs on exit is not a hunt for the handle you missed.

It returns a promise that settles once the last thing the server had to say has gone. A script that
means to exit under its own steam has something to wait for. Yulin installs no signal handlers,
since a library taking over process signals gets in the way of whatever else the process is doing.
Call `close()` from your own handler:

```typescript sim-serve-shutdown
/**
 * Closing a served environment when the process is asked to stop.
 */

import { serveSimAws } from "@kensio/yulin/serve";

const srv = await serveSimAws({ port: 8787 });

async function stopServing(): Promise<void> {
  // Waiting means anything the server still had to say has gone before the
  // process does.
  await srv.close();
}

process.on("SIGTERM", () => {
  void stopServing();
});
```

Closing twice is safe, and so is closing a server whose environment started nothing. What closes is
the handles that keep the process alive. Every simulated Bucket, Table and Stack is where it was,
and the environment goes on working. A script can close and carry on.

An unserved environment has the same call on it. `simAws.close()` lets go of its template file
watches and mounted directory watches, and a test with one of those closes it in one line:

```typescript sim-serve-close-environment
/**
 * Letting go of what an unserved environment is holding.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/TestStack.template.json",
  watch: true,
});

// The Stack, and everything the template deployed, is still there afterwards.
await simAws.close();
```

### Asking for a signal handler

The handler above is yours to write, and that is the point. Your script decides what a signal means
and in what order things happen. A script that wants the usual behaviour can ask for it instead, and
gets the same close on `SIGINT` and `SIGTERM`:

```typescript sim-serve-close-on-signal
/**
 * Asking for the signal handler rather than writing one.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 8787, liveReload: true });

// Build the simulated environment the pages are served from here.

// Asking is the whole of it. The handler closes the server and the environment
// it serves, and the process then exits on its own.
const stopListening = srv.closeOnSignal();

// A script that stops wanting the handler before the process ends takes it off
// again:
stopListening();
```

The handler goes on at that call and no sooner. A process that never asks keeps its signals to
itself. `closeOnSignal({ signals: ["SIGHUP"] })` names other signals. The handlers come off as the
first one arrives, and a second Ctrl-C from someone who has waited long enough lands on Node's own
default and ends the process. Closing never exits the process itself. It lets go of what Yulin was
holding, and a process with no work left then exits on its own. `SimAws` has the same method, for an
unserved environment.

A restart usually overlaps the process it replaces. `listen` waits a couple of seconds for a pinned
port that is still held, then throws `SimAwsLocalPortInUse` naming the port. By then something other
than the outgoing process owns it.

## Live reload

A page served from a simulated Bucket website, CloudFront distribution, Function URL or HTTP API has
only Yulin in its response path. Yulin is the one thing that can tell the browser to reload. Turning
`liveReload` on serves a reload channel and puts a small script into the HTML pages it serves to
browsers:

```typescript sim-serve-live-reload
/**
 * Serving with live reload, so a browser reloads itself when the process
 * restarts.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 8787, liveReload: true });

// Build the simulated environment the pages are served from here.

async function stopServing(): Promise<void> {
  // Waiting means the browsers hear about the restart before the process goes.
  await srv.close();
}

process.on("SIGTERM", () => {
  void stopServing();
});
```

It is off by default, and every response is then byte for byte what it would otherwise be.

### Reloading on a restart

Local development means restarting the process, because a changed setup script or Lambda handler
needs a fresh module graph. The script survives that on its own, with no supervisor process and no
shared state between the outgoing and incoming process.

The channel is Server-Sent Events, and the browser reconnects by itself. Each process has a boot id
and sends it to every page that connects. A page that reconnects and finds a different boot id knows
it is showing output from a process that has gone, and reloads. A blip on a still running process
hands back the same boot id, and the page carries on.

`close()` sends a `reloading` event before the connections go. A page then reads the gap it is about
to see as a restart, and not a server that has died. The page keeps its own appearance and gets a
`data-sim-aws-live-reload="reloading"` attribute on its `<html>` element, ready to style:

```css
html[data-sim-aws-live-reload="reloading"] {
  opacity: 0.6;
}
```

The event has to reach the browser before the connection goes. `close()` sees the reload streams out
before it destroys anything else the server was holding, and its promise settles once they have
gone. A browser that has stopped answering is waited on for half a second and then dropped. A page
nobody is looking at cannot hold up a restart. Both ports are released before any of that waiting,
and a replacement process can take them straight away either way.

None of this needs a supervisor process. A dev script started from an IDE debugger gets browser
reload with the debugger attached throughout.

### Reloading without a restart

For a change that needs no restart, such as new content in a simulated Bucket, `reload()` reloads
every connected browser:

```typescript sim-serve-reload
/**
 * Reloading connected browsers after changing simulated content in place.
 */

import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, liveReload: true });

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "foo-site" }));
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "foo-site",
    Key: "index.html",
    Body: "<h1>Changed</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);

srv.reload();

await srv.close();
```

`reload()` throws when live reload is off.

You can also hand the server to something that reloads for you, either a
[mounted directory](#reloading-when-a-build-changes-a-mounted-directory) or a
[watched template file](#answering-a-change-instead-of-restarting), both as `{ reload: srv }`. A
watched template file refuses a server it could never reload as it is handed over, ahead of the
first change.

### Reloading when a build changes a mounted directory

A Bucket mounted on a local directory is already reading the files a site generator writes. A
rebuild needs nothing copied into it. Hand the mount the server and it watches the directory and
reloads for you once the writes stop:

```typescript sim-serve-mount-reload
/**
 * A built site the process reloads the browser for, rather than restarting for.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 8787, liveReload: true });

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));

simAws
  .s3()
  .mountBucketFilesystem("site", path.join(process.cwd(), "articles/public"), {
    reload: srv,
  });
```

One build is one reload, however many files it wrote. See
[filesystem-backed Bucket storage](../services/s3/README.md#reloading-the-browser-when-the-directory-changes)
for the `settleMs` override and for stopping the watch.

### What gets the script

Yulin's own account of a request goes in headers and never in the body. A response keeps the shape
the real service returns. Live reload breaks that rule on purpose, and only for a page a browser is
about to render. A response gets the script only when all of this holds:

- the response media type is `text/html` exactly
- the request `accept` header asks for `text/html`
- the request carries no SigV4 signature, in either an `authorization` header or the query string of
  a presigned URL, and no `x-amz-*` header
- the response has no `content-encoding`
- the response status is other than 206, and the request is not a `HEAD`

So an SDK `GetObject` for an HTML Object gets the stored bytes, byte for byte, while a browser
looking at the same Object through a website endpoint gets the script.

An injected response carries `x-sim-aws-live-reload: injected`. Its `content-length` is recomputed,
and `etag` and `last-modified` are dropped, since the bytes are no longer the ones those headers
describe. Its `cache-control` is set to `no-store`, replacing whatever the service said, because a
page held in the browser cache is a page live reload cannot reach. The script goes in before
`</body>`, or before `</html>` when there is no body element, or on the end when the HTML has no
such element.

### The reserved path

The reload channel is served at `/__sim-aws/live-reload` on every hostname the server answers on. A
page can ask for it relative to wherever it was served from. While live reload is on, no simulated
service can serve anything at that path.

## Restarting on a file change

Live reload gets a page back on its feet after the process restarts. `yulin watch` is what restarts
it. Run the dev script through it and a save is the whole loop:

```bash
yulin watch -- tsx dev.ts
```

Everything after `--` is the command, run as written and restarted when something changes. The CLI
never imports it, never looks for an exported setup function, and takes no interest in whether the
simulation was built from SDK commands, a CloudFormation template, or several `SimAws` instances at
once. The only change to a dev script is turning `liveReload` on.

Restarting is the deliberate choice, over swapping code in place. A Lambda handler is a function
reference out of your own module graph, and a new process re-imports it with no module cache to
defeat. It also keeps simulated state the same as what a fresh test run sees, since seeding is part
of the setup script and runs again.

### What is watched

The working directory, minus the paths nobody edits by hand. Those are `node_modules`, `.git`,
`dist`, `coverage`, CDK asset directories, and the working files an editor writes around a save.

On top of that, Yulin names paths it is holding that the module graph never mentions. A directory
given to `mountBucketFilesystem` and a template given to `deployTemplateFile` are reported to the
supervisor as they are registered, and watched from then on, without appearing in any list. Editing
a file in a mounted directory or re-synthing a stack restarts the process.

A path the process is watching itself is the exception, and is
[left to the process reading it](#answering-a-change-instead-of-restarting). That covers a template
deployed with the `watch` option, and a directory mounted with somewhere to reload. So is any other
path the process [says it is holding](#holding-a-path-yourself).

### One restart for a burst of writes

A burst of writes is one restart. Saving one file is several filesystem events, and changes are held
until they stop arriving before anything is restarted. The wait is 250ms by default. A build writing
hundreds of files gets one restart, however many files it wrote.

The number is set by what a build needs, and a save pays for it. macOS hands a recursive watch its
events in waves. A build writing several thousand files was measured arriving as tens of waves up to
49ms apart, and a window anywhere near that turns one build into several restarts. A build that
pauses between its own phases, as a tool that resolves before it writes does, pauses for longer than
that again. 250ms clears the waves several times over and covers the shorter of those pauses, at the
cost of 250ms before a plain save is acted on.

A project whose build is unusual can say so on the command line:

```bash
yulin watch --settle=600 -- tsx dev.ts
```

Writes that keep arriving push the wait back. A build that never goes quiet would otherwise hold the
restart off for as long as it ran, so a burst is acted on after five seconds however much is still
arriving, and the writes after that are a burst of their own. That is a backstop for a build that
writes continuously for minutes. An ordinary build never reaches it.

### Holding a path yourself

A process that is already watching a path and answering changes to it in place has nothing to gain
from a restart, and everything its simulation holds to lose. `simWatch.reportHeldPath(...)` says so,
and the supervisor leaves that path alone from then on:

```typescript sim-serve-hold-path
/**
 * A mounted directory this process watches itself, reloading the browser
 * rather than being restarted for it.
 */

import { watch } from "node:fs";
import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";
import { simWatch } from "@kensio/yulin/watch";

const built = path.join(process.cwd(), "public");

const simAws = new SimAws();
await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));
simAws.s3().mountBucketFilesystem("site", built);

const srv = await serveSimAws({ simAws, port: 8787, liveReload: true });

simWatch.reportHeldPath(built);

watch(built, { recursive: true }, () => {
  srv.reload();
});
```

A static site build writing into that directory then reloads the page, where the mount alone would
have restarted the process and taken every simulated Bucket, Table and Stack with it. Holding a path
beats having reported it. Being told a path is answered in the process is more specific than being
told it is worth watching, so holding wins even though `mountBucketFilesystem` reported the same
directory first.

A held path stays held only for the run that reported it. A run that exits releases the path, and
the supervisor watches it again until its replacement says otherwise.

`simWatch.onStopping(...)` is the other half, for a restart this process has no say in. It runs just
before the supervisor kills the process. Live reload uses that moment to tell browsers a reload is
coming, so a page comes back on its own. A hand-written reload channel wants the same warning.

Both are best effort and need a supervisor. In a process `yulin watch` never started, such as a test
run or a script launched from an IDE debugger, both are no-ops.

This is the general case, for a path nothing else knows about. A mounted directory is the one Yulin
does know about. `mountBucketFilesystem` takes a reload target, holds the path itself and settles
the writes, so the example above is written for you. See
[reloading when a build changes a mounted directory](#reloading-when-a-build-changes-a-mounted-directory).

### Answering a change instead of restarting

A deployment that watches its own template file is left alone by the supervisor:

```typescript sim-serve-watch-template
/**
 * A template the process updates its stack from, rather than restarting for.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 8787, liveReload: true });

await simAws.cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/TestStack.template.json",
  watch: {
    reload: srv,
  },
});
```

Re-synthing the stack then updates it in place and reloads the page. The reload waits for the update
and not the write. The page comes back on the resources the new template asked for, and an update
that failed reloads nothing. Whatever the change left alone keeps what it holds in simulated S3,
DynamoDB and SQS, where a restart would have taken all of it. The process names the template as one
it is answering itself, and the supervisor takes it off its own list. See
[watching a template file](../services/cloudformation/README.md#watching-a-template-file) for what
an update does to the resources.

A directory mounted with somewhere to reload is left alone the same way. The Bucket is reading the
files either way, and a rebuild has nothing to redo. The browser is reloaded, and everything else
the process is holding stays where it is. A restart would have taken the whole simulated environment
for the sake of a page that changed. See
[reloading when a build changes a mounted directory](#reloading-when-a-build-changes-a-mounted-directory).

A template synthesized against a real account sometimes needs adapting before Yulin will take it.
`transform` is given the parsed template and answers with the one to deploy, on the deployment and
again on every change. The file the supervisor leaves alone is still the one in `cdk.out`:

```typescript sim-serve-transform-template
/**
 * Adapting a watched template, so the file being watched is the real one.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 8787, liveReload: true });

await simAws.cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/TestStack.template.json",
  transform: (template) => ({
    ...template,
    Resources: Object.fromEntries(
      Object.entries(template.Resources).filter(
        ([logicalId]) => logicalId !== "SiteAliasRecord",
      ),
    ),
  }),
  watch: {
    onUpdated: () => {
      srv.reload();
    },
  },
});
```

A transform that throws is reported the way a failed update is. The process and the resources it is
serving are left where they were. See
[adapting a synthesized template](../services/cloudformation/README.md#adapting-a-synthesized-template-on-the-way-in).

Both work with no supervisor at all. A dev script started from an IDE debugger picks up a re-synth
or a rebuild with the debugger attached throughout.

### When a run goes wrong

A setup script that throws leaves the watcher up. The error is on the terminal and the next save is
the retry, with no watch to start over.

Setup that writes into a watched path restarts the process, which writes again, which restarts it.
`yulin watch` refuses to run that loop. After a few restarts caused by the same file changing
straight after startup, it stops and names the file. Write generated files outside the working
directory, or into a directory the watch passes over.

### Debugging

A process started by `yulin watch` can be debugged. Attach the debugger to that process, and not to
the supervisor, which has nothing worth stepping through. Pass an inspector flag to the watch and it
reaches each run through `NODE_OPTIONS`, whether the command is `node` or something that spawns it:

```bash
yulin watch --inspect=9230 -- tsx dev.ts
```

Each run binds the same inspector port, because the process it replaces has fully exited by the time
the replacement starts. Attaching to that port with reconnect turned on in your IDE keeps a debugger
across restarts. The exact run configuration differs between IDEs.

Live reload works without the supervisor. A dev script launched straight from an IDE debugger still
gets browser reload and still picks up a re-synthed template. A handler edit is a manual restart, as
it is without watch mode.

## Limitations

- An injected page is not byte for byte what the real service would return, and its `cache-control`
  is the simulator's rather than the service's. That is the point of the feature, and the reason it
  is off by default and says so on startup.
- `/__sim-aws/live-reload` is shadowed on every served hostname while live reload is on.
- Injection decodes the HTML as UTF-8. A page stored in another encoding would be corrupted, so
  serve HTML as UTF-8.
- An open reload connection uses one of the browser's six connections per origin per tab.
- There is no overlay for a reload that failed. The terminal has the error.
- `yulin watch` does not re-synth CDK. `cdk watch` is a shortcut for `deploy --watch` against real
  AWS and there is no synth-only watch, so run your own synth and let the watch pick up its output.
- A template updated in place still replaces a changed resource, so the objects in a bucket the
  change touches go with it. Only the resources the template left alone keep what they hold.
- Lambda and CloudFront Function code is not swapped without a restart. A fresh process picks up an
  edited handler correctly, and an in-process swap would have to invalidate an ESM import subgraph
  that the language keeps private.
- Simulated state is not carried across a restart. Seeding belongs in the setup script, so it runs
  again and local state stays the same as what tests and CI see.
- The IDE run configurations for attaching a debugger to a watched process are not documented yet.
- The served AWS service API covers S3, STS and the AWS JSON protocol services. A service speaking REST-JSON, or Query other than STS, is refused with `501 Not Implemented`.
- `GetCallerIdentity` is the only STS operation served. `AssumeRole` over a port would mean the temporary credentials it issues have to sign the calls that follow, which is its own piece of work.
- A served AWS API request is routed by its SigV4 credential scope. An unsigned one reaches nothing, whatever endpoint URL it used.
