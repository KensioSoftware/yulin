import { assertArrayEquals } from "@kensio/smartass";
import { afterEach, describe, it, vi } from "vitest";
import { SimWatchSettle } from "./sim-watch-settle.js";

describe("SimWatchSettle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("makes one change out of a burst of writes", () => {
    // Given the several writes one editor save produces
    const { settled, settle } = settling();

    // When they arrive faster than the settle window
    settle.record("src/handler.ts");
    vi.advanceTimersByTime(40);
    settle.record("src/handler.ts~");
    vi.advanceTimersByTime(40);
    settle.record("src");
    vi.advanceTimersByTime(100);

    // Then one change is reported, named after the file that started it
    assertArrayEquals(settled, ["src/handler.ts"]);
  });

  it("reports a later change separately", () => {
    // Given a change that has already settled
    const { settled, settle } = settling();
    settle.record("src/first.ts");
    vi.advanceTimersByTime(100);

    // When another arrives afterwards
    settle.record("src/second.ts");
    vi.advanceTimersByTime(100);

    // Then it is a change of its own
    assertArrayEquals(settled, ["src/first.ts", "src/second.ts"]);
  });

  it("acts on a burst that never goes quiet", () => {
    // Given a build writing files without a pause long enough to settle in
    const { settled, settle } = settling(100, 500);

    // When the writes go on for more than twice the longest wait allowed
    for (let elapsed = 0; elapsed < 1400; elapsed += 50) {
      settle.record("dist/page.html");
      vi.advanceTimersByTime(50);
    }

    // Then each stretch of the build is one change, taken while it was still
    // writing rather than held until the end of it
    assertArrayEquals(settled, ["dist/page.html", "dist/page.html"]);
  });

  it("waits the settle window out when the longest wait is shorter", () => {
    // Given a window longer than the wait meant to cap it
    const { settled, settle } = settling(100, 10);

    // When one save arrives
    settle.record("src/handler.ts");
    vi.advanceTimersByTime(50);

    // Then the window is still what a save is held for, since ending a burst
    // sooner than the window is what the window is there to stop
    assertArrayEquals(settled, []);
    vi.advanceTimersByTime(50);
    assertArrayEquals(settled, ["src/handler.ts"]);
  });

  it("drops a change that was still settling when it was cancelled", () => {
    // Given a change waiting to see whether more are coming
    const { settled, settle } = settling();
    settle.record("src/handler.ts");

    // When the watcher shuts down first
    settle.cancel();
    vi.advanceTimersByTime(100);

    // Then nothing is restarted for it
    assertArrayEquals(settled, []);
  });
});

interface Settling {
  readonly settled: string[];
  readonly settle: SimWatchSettle;
}

function settling(settleMs = 100, maxWaitMs = 5000): Settling {
  vi.useFakeTimers();
  const settled: string[] = [];

  return {
    settled,
    settle: new SimWatchSettle({
      settleMs,
      maxWaitMs,
      onSettled: (changedPath) => {
        settled.push(changedPath);
      },
    }),
  };
}
