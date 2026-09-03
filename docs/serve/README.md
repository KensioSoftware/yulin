# Serve Yulin on localhost

Yulin can handle HTTP and DNS requests either in process or through local network ports.

## Start a local server

Use `serveSimAws` when a browser, command-line program, or application in another process needs to
reach the simulation:

```typescript sim-serve-localhost
/**
 * Serving a simulated AWS environment on localhost.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const server = await serveSimAws({ simAws, port: 8787 });

console.log(server.port); // "8787"
console.log(server.hostname); // "sim-aws.localhost"

await server.close();
```

Omit `port` to let the operating system choose a free port. Read the selected value from
`server.port`.

The server keeps simulated service hostnames in the URL. `server.localUrl(...)` converts a URL
returned by Yulin into an address served by this server:

```typescript
const localUrl = server.localUrl(
  "https://my-site.s3-website.eu-west-2.sim-aws.localhost/index.html",
);

console.log(localUrl.toString());
// http://my-site.s3-website.eu-west-2.sim-aws.localhost:8787/index.html
```

The server also rewrites an absolute `Location` response header when it points to a hostname in the
simulation. Relative redirects and redirects to unknown hosts are left unchanged.

## Send HTTP requests in process

Use `SimAwsHttp` for tests and other callers in the same process. It accepts the same inputs as
`fetch`, but it opens no socket:

```typescript sim-serve-in-process-request
/**
 * Requesting a simulated S3 website without starting a server.
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
const http = new SimAwsHttp({ simAws });
const s3 = simAws.region("eu-west-2").s3();

await s3.createBucket(new CreateBucketCommand({ Bucket: "site" }));
await s3.putObject(
  new PutObjectCommand({
    Bucket: "site",
    Key: "index.html",
    Body: "<h1>Hello</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);
await s3.putBucketWebsite(
  new PutBucketWebsiteCommand({
    Bucket: "site",
    WebsiteConfiguration: { IndexDocument: { Suffix: "index.html" } },
  }),
);
await s3.putPublicAccessBlock(
  new PutPublicAccessBlockCommand({
    Bucket: "site",
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
    },
  }),
);
await s3.putBucketPolicy(
  new PutBucketPolicyCommand({
    Bucket: "site",
    Policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::site/*",
      },
    }),
  }),
);

const response = await http.fetch(s3.getBucketWebsiteUrl("site"));

console.log(response.status); // 200
console.log(await response.text()); // <h1>Hello</h1>
```

`SimAwsHttp.fetch(input, init)` builds a Fetch API `Request` for you.
`SimAwsHttp.handleRequest(request)` accepts a request that is already built. Both methods use the
same routing, authentication, and service controllers as the local server.

`SimAwsHttp` uses simulated hostnames directly. HTTPS URLs also work because no network connection
or TLS handshake takes place.

## Connect an AWS SDK client

The local server exposes supported AWS service APIs through one endpoint URL. The client still
needs a Region and credentials issued by simulated IAM:

```typescript sim-serve-aws-api-endpoint
/**
 * Calling simulated DynamoDB through a local HTTP endpoint.
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

const iam = simAws.iam();
await iam.createUser(new CreateUserCommand({ UserName: "Operator" }));
await iam.putUserPolicy(
  new PutUserPolicyCommand({
    UserName: "Operator",
    PolicyName: "WriteWidgets",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "dynamodb:PutItem",
        Resource: "*",
      },
    }),
  }),
);
const created = await iam.createAccessKey(
  new CreateAccessKeyCommand({ UserName: "Operator" }),
);

const server = await serveSimAws({ simAws });
const client = new DynamoDBClient({
  region: simAws.defaultRegionName,
  endpoint: `http://localhost:${server.port}`,
  credentials: {
    accessKeyId: created.AccessKey.AccessKeyId,
    secretAccessKey: created.AccessKey.SecretAccessKey,
  },
});

await client.send(
  new PutItemCommand({
    TableName: "widgets",
    Item: { id: { S: "widget-1" } },
  }),
);

await server.close();
```

The endpoint reads the service and Region from the request's SigV4 credential scope. Simulated IAM
verifies the signature and authorizes the principal that owns the access key. Temporary credentials
from simulated STS work in the same way.

An unsigned AWS API request contains no service identity and is refused. Unknown credentials,
expired sessions, bad signatures, and denied actions return AWS-shaped authentication or
authorization errors.

Set `forcePathStyle: true` on an `S3Client` that uses the shared endpoint. The Bucket name must stay
in the request path because the endpoint hostname is `localhost`.

The [AWS CLI guide](https://yulinsim.dev/cli/) shows the equivalent environment variables and named
profile configuration.

## Query simulated DNS

`serveSimAws` starts a UDP DNS server beside the HTTP server. It usually uses the same port number,
but UDP may already be using that number. Always read `server.dnsPort`.

Point a DNS client at `127.0.0.1:<dnsPort>` to resolve records from simulated Route 53. Names that
route to an HTTP service resolve to `127.0.0.1`, where the local HTTP server is listening. The DNS
server also answers supported records such as TXT and NS records.

For example, with the DNS port set to `8787`:

```bash
dig @127.0.0.1 -p 8787 www.example.test A
```

The DNS server uses UDP only. `server.close()` releases both the HTTP and DNS ports.

## Stop the server

Always await `server.close()` when a script or test finishes. It closes active connections and any
file watchers owned by the `SimAws` instance. The simulated resources remain available in memory.

Yulin does not install process signal handlers automatically. A development script can ask the
server to close on `SIGINT` and `SIGTERM`:

```typescript sim-serve-close-on-signal
/**
 * Closing a local server when the process receives a termination signal.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const server = await serveSimAws({ simAws, port: 8787 });

const removeSignalHandlers = server.closeOnSignal();

// Call this only if the script later takes responsibility for signals itself.
removeSignalHandlers();
await server.close();
```

Pass `signals` to `closeOnSignal` to replace the default signal list. The returned function removes
the installed handlers. `SimAws.closeOnSignal()` provides the same behavior when no local server is
running.

A server waits for a pinned HTTP port for up to two seconds during startup. This allows a restarted
process to take the port after the previous process releases it. Yulin throws
`SimAwsLocalPortInUse` if the port stays occupied.

## Reload a browser after changes

Set `liveReload: true` when the local server is serving HTML during development:

```typescript sim-serve-live-reload
/**
 * Serving HTML with browser reload support.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const server = await serveSimAws({
  simAws,
  port: 8787,
  liveReload: true,
});

// Reload connected browsers after changing simulated content in place.
server.reload();

await server.close();
```

The server injects a small client script into an HTML response when all of these conditions hold:

- the response media type is `text/html`
- the request accepts `text/html`
- the request is unsigned and has no `x-amz-*` header
- the response is unencoded, has a body, and is not a partial response
- the request method is not `HEAD`

Signed SDK requests keep their original response bytes. An injected response has
`x-sim-aws-live-reload: injected`, uses `cache-control: no-store`, and drops validators that no
longer describe the changed body.

The reload channel uses `/__sim-aws/live-reload` on every served hostname. Calling `reload()` while
live reload is disabled throws an error.

### Reload after an in-process update

Pass the server as a reload target when Yulin already watches the changed files. A mounted S3
directory accepts `{ reload: server }`. A watched CloudFormation template accepts the same target:

```typescript sim-serve-watch-template
/**
 * Updating a stack and reloading browsers when its template changes.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const server = await serveSimAws({ simAws, liveReload: true });

await simAws.cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/TestStack.template.json",
  watch: { reload: server },
});

// Keep serving until the application shuts down.
```

Yulin waits for the stack update before reloading. A failed update leaves the current page and
resources in place.

### Restart after source changes

Run a development command through `yulin watch` when source changes require a new process:

```bash
yulin watch -- tsx dev.ts
```

The watcher restarts the command after files stop changing for 250 milliseconds. Use
`--settle=<milliseconds>` for builds that write files in longer bursts. It watches the working
directory and paths reported by Yulin, including mounted S3 directories and deployed template
files.

Paths handled in process are excluded from restart handling. This includes a template with a
`watch` option and a mounted directory with a reload target.

`yulin watch` keeps running when the child command throws. The next file change starts it again. It
also detects a setup loop where each start writes the file that caused the restart.

Pass `--inspect=<port>` to add a Node inspector port to each child process:

```bash
yulin watch --inspect=9230 -- tsx dev.ts
```

The watcher does not run `cdk synth`. Run your own synth command and let Yulin react to the changed
template file.

## Print simulated messages

While the local server is running, it prints messages recorded by simulated Cognito, SNS, and SES.
This puts confirmation codes and local-development emails in the terminal.

Use `messageLogging` to disable a message kind or shorten the printed part of an email:

```typescript sim-serve-message-logging
/**
 * Disabling SNS message output and limiting printed email text.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const server = await serveSimAws({
  simAws,
  messageLogging: {
    sns: false,
    emailTextLimit: 500,
  },
});

await server.close();
```

`messageLogging: false` disables all message output. An object leaves every omitted kind enabled.
Email output includes the sender, recipients, subject, and text body up to the configured limit.
HTML bodies are reported by size.

Only messages recorded while the server is running are printed. The service-specific message
history remains available through its inspection methods.

## Available functionality

- `serveSimAws` exposes simulated service hosts and supported AWS APIs over local HTTP.
- `SimAwsHttp` handles Fetch API requests in process.
- `SimAwsDns` handles DNS datagrams in process, and `SimAwsDnsServer` serves them over UDP.
- `server.localUrl(...)` converts simulated service URLs to the server's local port.
- `server.close()`, `server.closeOnSignal()`, and `simAws.close()` release network and file-watching
  resources.
- Live reload supports explicit reloads, watched templates, mounted S3 directories, and process
  restarts.
- The server logs simulated Cognito messages, SNS text messages, and SES emails by default.
- The shared AWS API endpoint serves S3, STS, IAM, ELBv2, SNS, CloudFormation, Lambda, and simulated
  services that use the AWS JSON protocol.

The AWS JSON services include DynamoDB, DynamoDB Streams, SQS, Cognito Identity Provider,
EventBridge, ECS, SSM, ACM, CloudWatch, CloudWatch Logs, KMS, Secrets Manager, and Rekognition. Each
service guide lists its supported commands.

## Limitations

- The local server speaks HTTP only. `localUrl(...)` changes an HTTPS service URL to HTTP.
- Only the `Location` header is rewritten for local browsing. URLs in response bodies and cookie
  domains remain unchanged.
- Live reload changes eligible HTML responses and is disabled by default. It decodes HTML as UTF-8.
- Live reload reserves `/__sim-aws/live-reload` and has no browser overlay for update failures.
- The DNS server uses UDP only.
- `yulin watch` does not preserve simulated state across a restart or reload changed Lambda and
  CloudFront Function code inside the current process.
- The shared AWS API endpoint refuses unsupported protocols and operations with `501 Not
Implemented`.
- Some service functionality is available only through `SimAws` or SDK interception. Check the
  relevant service guide before depending on access through the local endpoint.
