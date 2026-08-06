# Serving simulated AWS on localhost

Serving puts a simulated AWS environment behind a real port, so a browser, `curl` or an SDK client
reaches it over HTTP.

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

srv.close();
```

Without a `port` the server takes whatever port is free, which changes on every run. Pin one when
the URL needs to stay the same, such as when a browser is pointed at it.

Simulated hostnames do not resolve to the port the server took, so a URL from a simulated service
needs adapting before it can be fetched. `srv.localUrl(...)` does that:

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

srv.close();
```

## Stopping and restarting

`close()` stops serving and ends the connections the server is holding, so the process can exit.
Yulin installs no signal handlers, since a library taking over process signals gets in the way of
whatever else the process is doing. Call `close()` from your own handler:

```typescript sim-serve-shutdown
/**
 * Closing a served environment when the process is asked to stop.
 */

import { serveSimAws } from "@kensio/yulin/serve";

const srv = await serveSimAws({ port: 8787 });

process.on("SIGTERM", () => {
  srv.close();
});
```

A restart usually overlaps the process it replaces. `listen` waits a couple of seconds for a pinned
port that is still held, then throws `SimAwsLocalPortInUse` naming the port, which means something
other than the outgoing process owns it.

## Live reload

A page served from a simulated Bucket website, CloudFront distribution, Function URL or HTTP API has
nothing but Yulin in its response path, so Yulin is the only thing that can tell the browser to
reload. Turning `liveReload` on serves a reload channel and puts a small script into the HTML pages
it serves to browsers:

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

process.on("SIGTERM", () => {
  srv.close();
});
```

It is off by default. With it off, no response differs by a byte from what it would otherwise be.

### Reloading on a restart

Local development means restarting the process, because a changed setup script or Lambda handler
needs a fresh module graph. The script survives that on its own, with no supervisor process and
nothing shared between the outgoing and incoming process.

The channel is Server-Sent Events rather than a WebSocket, so the browser reconnects by itself. Each
process has a boot id and sends it to every page that connects. A page that reconnects and finds a
different boot id knows it is showing output from a process that is no longer running, and reloads.
A page that reconnects to the same boot id, which is what a blip on a still running process gives,
does nothing.

`close()` sends a `reloading` event before the connections go, so a page knows the gap it is about to
see is a restart rather than a server that has died. The page is not drawn over. It gets a
`data-sim-aws-live-reload="reloading"` attribute on its `<html>` element, which it can style:

```css
html[data-sim-aws-live-reload="reloading"] {
  opacity: 0.6;
}
```

This works with no supervisor process involved, so a dev script started from an IDE debugger gets
browser reload with the debugger attached throughout.

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

srv.close();
```

`reload()` throws when live reload is off, rather than quietly doing nothing.

### What gets the script

Yulin's own account of a request goes in headers and never in the body, so a response keeps the shape
the real service returns. Live reload breaks that rule on purpose, and only for a page a browser is
about to render. A response gets the script only when all of this holds:

- the response media type is `text/html` exactly
- the request `accept` header asks for `text/html`
- the request carries no SigV4 signature, in either an `authorization` header or
  the query string of a presigned URL, and no `x-amz-*` header
- the response has no `content-encoding`
- the response status is not 206, and the request is not a `HEAD`

So an SDK `GetObject` for an HTML Object gets the stored bytes, byte for byte, while a browser
looking at the same Object through a website endpoint gets the script.

An injected response carries `x-sim-aws-live-reload: injected`. Its `content-length` is recomputed,
and `etag` and `last-modified` are dropped, since the bytes are no longer the ones those headers
describe. Its `cache-control` is set to `no-store`, replacing whatever the service said, because a
page held in the browser cache is a page live reload cannot reach. The script goes in before
`</body>`, or before `</html>` when there is no body element, or on the end when the HTML has
neither.

### The reserved path

The reload channel is served at `/__sim-aws/live-reload` on every hostname the server answers on, so
a page can ask for it relative to wherever it was served from. While live reload is on, no simulated
service can serve anything at that path.

## Restarting on a file change

Live reload gets a page back on its feet after the process restarts. `yulin watch` is what restarts
it. Run the dev script through it and a save is the whole loop:

```bash
yulin watch -- tsx dev.ts
```

Everything after `--` is the command, run as written and restarted when something changes. The CLI
does not import it, does not look for an exported setup function, and does not care whether the
simulation was built from SDK commands, a CloudFormation template, or several `SimAws` instances at
once. The only change to a dev script is turning `liveReload` on.

A restart, rather than swapping code in place, is the deliberate choice. A Lambda handler is a
function reference out of your own module graph, and a new process re-imports it with no module cache
to defeat. It also keeps simulated state the same as what a fresh test run sees, since seeding is
part of the setup script and runs again.

### What is watched

The working directory, minus what nothing edits by hand: `node_modules`, `.git`, `dist`, `coverage`,
CDK asset directories, and the working files an editor writes around a save.

On top of that, Yulin names paths it is holding that the module graph never mentions. A directory
given to `mountBucketFilesystem` and a template given to `deployTemplateFile` are reported to the
supervisor as they are registered, and watched from then on, without appearing in any list. Editing
a file in a mounted directory or re-synthing a stack restarts the process. A template deployed with
the `watch` option is the exception, and is
[left to the process reading it](#updating-a-stack-instead-of-restarting).

A burst of writes is one restart. Saving one file is several filesystem events, so changes are held
until they stop arriving before anything is restarted.

### Updating a stack instead of restarting

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
    onUpdated: () => {
      srv.reload();
    },
  },
});
```

Re-synthing the stack then updates it in place and reloads the page. Whatever the change left alone
keeps what it holds in simulated S3, DynamoDB and SQS, where a restart would have taken all of it.
The process names the template as one it is answering itself, so the supervisor takes it off its own
list rather than restarting for it. See
[watching a template file](../services/cloudformation/README.md#watching-a-template-file) for what
an update does to the resources.

A template synthesized against a real account sometimes needs adapting before Yulin will take it.
`transform` is given the parsed template and answers with the one to deploy, on the deployment and
again on every change, so the file the supervisor leaves alone is still the one in `cdk.out`:

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

A transform that throws is reported the way a failed update is, so the process and the resources it
is serving are left where they were. See
[adapting a synthesized template](../services/cloudformation/README.md#adapting-a-synthesized-template-on-the-way-in).

This works with no supervisor at all, so a dev script started from an IDE debugger picks up a
re-synth with the debugger attached throughout.

### When a run goes wrong

A setup script that throws leaves the watcher up. The error is on the terminal and the next save is
the retry, with no watch to start over.

Setup that writes into a watched path restarts the process, which writes again, which restarts it.
That is refused rather than run: after a few restarts caused by the same file changing straight after
startup, `yulin watch` stops and names the file. Write generated files outside the working directory,
or into a directory the watch passes over.

### Debugging

A process started by `yulin watch` can be debugged, but the debugger has to attach to that process
rather than to the supervisor, which does nothing worth stepping through. Pass an inspector flag to
the watch and it reaches each run through `NODE_OPTIONS`, so it works whether the command is `node`
or something that spawns it:

```bash
yulin watch --inspect=9230 -- tsx dev.ts
```

Each run binds the same inspector port, because the process it replaces has fully exited by the time
the replacement starts. Attaching to that port with reconnect turned on in your IDE keeps a debugger
across restarts. The exact run configuration differs between IDEs and is not documented here yet.

Nothing about live reload needs the supervisor. A dev script launched straight from an IDE debugger
still gets browser reload and still picks up a re-synthed template, and a handler edit is a manual
restart as it is without watch mode.

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
  that the language does not expose.
- Simulated state is not carried across a restart. Seeding belongs in the setup script, so it runs
  again and local state stays the same as what tests and CI see.
- The IDE run configurations for attaching a debugger to a watched process are not documented yet.
