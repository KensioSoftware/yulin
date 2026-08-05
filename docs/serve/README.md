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

## Limitations

- An injected page is not byte for byte what the real service would return, and its `cache-control`
  is the simulator's rather than the service's. That is the point of the feature, and the reason it
  is off by default and says so on startup.
- `/__sim-aws/live-reload` is shadowed on every served hostname while live reload is on.
- Injection decodes the HTML as UTF-8. A page stored in another encoding would be corrupted, so
  serve HTML as UTF-8.
- An open reload connection uses one of the browser's six connections per origin per tab.
- Nothing is watched. Yulin reloads when the process restarts or when `reload()` is called, and
  choosing what to watch is left to whatever runs the dev script.
- There is no overlay for a reload that failed. The terminal has the error.
