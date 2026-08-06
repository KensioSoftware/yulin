import { assertArrayEquals } from "@kensio/smartass";
import { afterEach, describe, it, vi } from "vitest";
import { SimWatchSettle } from "./sim-watch-settle.js";

describe("SimWatchSettle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("makes one change out of a burst of writes", () => {
    // Given the several writes one editor save produces
    vi.useFakeTimers();
    const settled: string[] = [];
    const settle = new SimWatchSettle({
      settleMs: 100,
      onSettled: (changedPath) => {
        settled.push(changedPath);
      },
    });

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
    vi.useFakeTimers();
    const settled: string[] = [];
    const settle = new SimWatchSettle({
      settleMs: 100,
      onSettled: (changedPath) => {
        settled.push(changedPath);
      },
    });
    settle.record("src/first.ts");
    vi.advanceTimersByTime(100);

    // When another arrives afterwards
    settle.record("src/second.ts");
    vi.advanceTimersByTime(100);

    // Then it is a change of its own
    assertArrayEquals(settled, ["src/first.ts", "src/second.ts"]);
  });

  it("drops a change that was still settling when it was cancelled", () => {
    // Given a change waiting to see whether more are coming
    vi.useFakeTimers();
    const settled: string[] = [];
    const settle = new SimWatchSettle({
      settleMs: 100,
      onSettled: (changedPath) => {
        settled.push(changedPath);
      },
    });
    settle.record("src/handler.ts");

    // When the watcher shuts down first
    settle.cancel();
    vi.advanceTimersByTime(100);

    // Then nothing is restarted for it
    assertArrayEquals(settled, []);
  });
});
