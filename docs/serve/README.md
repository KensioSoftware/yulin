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

await srv.close();
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

await srv.close();
```

## Stopping and restarting

`close()` stops serving and lets go of everything Yulin was holding, so the process can exit. That
is the HTTP port, the DNS port and the connections the server is holding, and the simulated
environment it was serving with them: the template files a deployment is
[watching](../services/cloudformation/README.md#watching-a-template-file) and the directories a
[mount](../services/s3/README.md#reloading-the-browser-when-the-directory-changes) is watching,
in whichever Account and Region each of them lives in. One call, so a script that does not exit is
not a hunt for the handle you missed.

It returns a promise that settles once the last thing the server had to say has gone, so a script
that means to exit rather than let the event loop empty has something to wait for. Yulin installs no
signal handlers, since a library taking over process signals gets in the way of whatever else the
process is doing. Call `close()` from your own handler:

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

Closing twice does nothing twice, and closing a server whose environment started nothing is not an
error. What is closed is the handles that keep the process alive: every simulated Bucket, Table and
Stack is where it was, and the environment goes on working, so a script that closes and carries on
can.

An environment that is not being served has the same call on it. `simAws.close()` lets go of its
template file watches and mounted directory watches, and a test with one of those has one line
rather than a list:

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

The handler above is yours to write, which is the point: your script decides what a signal means and
in what order things happen. A script that wants nothing more than the usual can say so instead, and
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

Nothing is installed until that call, so the default stands: a process that never asks keeps its
signals to itself. `closeOnSignal({ signals: ["SIGHUP"] })` names other signals. The handlers come
off as the first one arrives, so a second Ctrl-C from someone who has waited long enough lands on
Node's own default and ends the process. Nothing here exits the process either: closing lets go of
what Yulin was holding, and a process with nothing else to do then exits on its own. `SimAws` has
the same method, for an environment that is not served.

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

async function stopServing(): Promise<void> {
  // Waiting means the browsers hear about the restart before the process goes.
  await srv.close();
}

process.on("SIGTERM", () => {
  void stopServing();
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

The event has to reach the browser before the connection does, so `close()` sees the reload streams
out before it destroys anything else the server was holding, and its promise settles once they have
gone. A browser that has stopped answering is waited on for half a second and then dropped, so a page
nobody is looking at cannot hold up a restart. Both ports are released before any of that waiting, so
a replacement process can take them straight away either way.

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

await srv.close();
```

`reload()` throws when live reload is off, rather than quietly doing nothing.

### Reloading when a build changes a mounted directory

A Bucket mounted on a local directory is already reading the files a site generator writes, so a
rebuild needs nothing copying into it. Hand the mount the server and it watches the directory and
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
a file in a mounted directory or re-synthing a stack restarts the process.

A path the process is watching itself is the exception, and is
[left to the process reading it](#answering-a-change-instead-of-restarting): a template deployed
with the `watch` option, and a directory mounted with somewhere to reload. So is any other path the
process [says it is holding](#holding-a-path-yourself).

### One restart for a burst of writes

A burst of writes is one restart. Saving one file is several filesystem events, so changes are held
until they stop arriving before anything is restarted. The wait is 250ms by default, and a build
writing hundreds of files is one restart rather than one per file.

The number is what a build needs rather than what a save needs. macOS hands a recursive watch its
events in waves rather than one at a time: a build writing several thousand files was measured
arriving as tens of waves up to 49ms apart, so a window anywhere near that turns one build into
several restarts. A build that pauses between its own phases, as a tool that resolves before it
writes does, pauses for longer than that again. 250ms clears the waves several times over and covers
the shorter of those pauses, at the cost of 250ms before a plain save is acted on.

A project whose build is unusual can say so, rather than moving the default:

```bash
yulin watch --settle=600 -- tsx dev.ts
```

Writes that keep arriving push the wait back, so a build that never goes quiet would otherwise hold
the restart off for as long as it ran. A burst is acted on after five seconds however much is still
arriving, and the writes after that are a burst of their own. That is a backstop for a build that
writes continuously for minutes, not something an ordinary build reaches.

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
beats having reported it: being told a path is answered in the process is more specific than being
told it is worth watching, so it wins even though `mountBucketFilesystem` reported the same directory
first.

A held path stays held only for the run that reported it. A run that exits leaves nothing holding
the path, and the supervisor watches it again until its replacement says otherwise.

`simWatch.onStopping(...)` is the other half, for a restart this process does not decide: it runs
just before the supervisor kills the process, which is where live reload tells browsers a reload is
coming so a page comes back on its own. A hand-written reload channel wants the same warning.

Both are best effort and need a supervisor. In a process `yulin watch` did not start, such as a test
run or a script launched from an IDE debugger, they do nothing at all.

This is the general case, for a path nothing else knows about. A mounted directory is the one Yulin
does know about: `mountBucketFilesystem` takes a reload target, holds the path itself and settles the
writes, so the example above is written for you. See
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

A directory mounted with somewhere to reload is left alone the same way. The Bucket is reading the
files either way, so a rebuild has nothing to redo: the browser is reloaded and everything else the
process is holding stays where it is, rather than the whole simulated environment going for the sake
of a page that changed. See
[reloading when a build changes a mounted directory](#reloading-when-a-build-changes-a-mounted-directory).

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

Both work with no supervisor at all, so a dev script started from an IDE debugger picks up a
re-synth or a rebuild with the debugger attached throughout.

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
