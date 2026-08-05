import vm from "node:vm";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simLiveReloadScript } from "./sim-live-reload-script.js";
import { simLiveReloadConfig } from "./sim-live-reload.config.js";

describe("simLiveReloadScript", () => {
  it("connects to the reserved channel path", () => {
    // Given a page running the script
    const page = new LiveReloadPage();

    // When it has run
    page.run();

    // Then it is listening on the reload channel
    assertIdentical(page.channel, simLiveReloadConfig.channelPath);
  });

  it("reloads when it reconnects to a different process", () => {
    // Given a page connected to one process
    const page = new LiveReloadPage();
    page.run();
    page.emit("boot", "first-boot-id");

    // When it reconnects and finds another one
    page.emit("boot", "second-boot-id");

    // Then it reloads, because a different process built what it is showing
    assertIdentical(page.reloads, 1);
  });

  it("does nothing when it reconnects to the same process", () => {
    // Given a page connected to a process
    const page = new LiveReloadPage();
    page.run();
    page.emit("boot", "first-boot-id");

    // When the connection drops and comes back to the same one
    page.emit("boot", "first-boot-id");

    // Then nothing happens, since nothing has been rebuilt
    assertIdentical(page.reloads, 0);
  });

  it("reloads when the server asks it to", () => {
    // Given a connected page
    const page = new LiveReloadPage();
    page.run();
    page.emit("boot", "first-boot-id");

    // When the server sends a reload
    page.emit("reload", "first-boot-id");

    // Then the page reloads
    assertIdentical(page.reloads, 1);
  });

  it("marks the document when a reload is on its way", () => {
    // Given a connected page
    const page = new LiveReloadPage();
    page.run();

    // When the server says it is going down for a reload
    page.emit("reloading", "first-boot-id");

    // Then the page can style that, rather than having anything drawn over it
    assertIdentical(page.documentState(), "reloading");
  });

  it("connects once when the script runs twice", () => {
    // Given a page that somehow got the script twice
    const page = new LiveReloadPage();
    page.run();

    // When the second copy runs
    page.run();

    // Then it is holding one connection, not two
    assertIdentical(page.connections, 1);
  });
});

interface PageEvent {
  readonly data: string;
}

type PageEventListener = (event: PageEvent) => void;

/**
 * A page running the injected script, with just enough browser around it for
 * the script to do what it does.
 */
class LiveReloadPage {
  reloads = 0;
  connections = 0;
  channel = "";

  private readonly listeners = new Map<string, PageEventListener>();
  private readonly dataset: Record<string, string> = {};
  private readonly context: vm.Context;
  private readonly onReload = (): void => {
    this.reloads += 1;
  };

  constructor() {
    this.context = vm.createContext({
      window: { location: { reload: this.onReload } },
      document: { documentElement: { dataset: this.dataset } },
      EventSource: this.eventSourceClass(),
    });
  }

  run(): void {
    vm.runInContext(simLiveReloadScript, this.context);
  }

  emit(event: string, data: string): void {
    this.listeners.get(event)?.({ data });
  }

  documentState(): string | undefined {
    return this.dataset["simAwsLiveReload"];
  }

  private eventSourceClass(): new (url: string) => PageEventSource {
    const { listeners } = this;
    const onConnect = (url: string): void => {
      this.channel = url;
      this.connections += 1;
    };

    return class {
      constructor(url: string) {
        onConnect(url);
      }

      addEventListener(event: string, listener: PageEventListener): void {
        listeners.set(event, listener);
      }
    };
  }
}

interface PageEventSource {
  addEventListener(event: string, listener: PageEventListener): void;
}
