import test from "node:test";
import assert from "node:assert/strict";
import {
  SignificantAudioPlayer,
  DEFAULT_AUDIO,
  parseAudioPreferences,
  significantAudioId,
} from "../src/ui/significant-audio.ts";
import type { GameState } from "../src/game/types.ts";

function environment() {
  const previous = new Map(
    ["window", "document", "sessionStorage", "fetch"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const stored = new Map<string, string>();
  const starts: string[] = [];
  const sources: Source[] = [];
  const requests: string[] = [];
  const pending = new Map<string, () => void>();
  let delayed = false;
  let hidden = false;
  let closed = false;
  let volume = -1;
  class Source {
    buffer: { cue: string } | null = null;
    onended: (() => void) | null = null;
    stopped = false;
    connect() {}
    disconnect() {}
    start() {
      starts.push(this.buffer!.cue);
    }
    stop() {
      this.stopped = true;
    }
    end() {
      this.onended?.();
    }
  }
  class Context {
    state = "suspended";
    currentTime = 0;
    destination = {};
    createGain() {
      return {
        gain: {
          set value(v: number) {
            volume = v;
          },
          setValueAtTime(v: number) {
            volume = v;
          },
        },
        connect() {},
        disconnect() {},
      };
    }
    createBufferSource() {
      const source = new Source();
      sources.push(source);
      return source;
    }
    async resume() {
      this.state = "running";
    }
    async suspend() {
      this.state = "suspended";
    }
    async close() {
      this.state = "closed";
      closed = true;
    }
    async decodeAudioData(bytes: ArrayBuffer) {
      return { cue: new TextDecoder().decode(bytes) };
    }
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: Context },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get hidden() {
        return hidden;
      },
    },
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => stored.set(k, v),
    },
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (url: string) => {
      requests.push(url);
      if (delayed)
        await new Promise<void>((resolve) => pending.set(url, resolve));
      return {
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(url).buffer,
      };
    },
  });
  return {
    starts,
    sources,
    requests,
    pending,
    get volume() {
      return volume;
    },
    get closed() {
      return closed;
    },
    hide() {
      hidden = true;
    },
    show() {
      hidden = false;
    },
    delay() {
      delayed = true;
    },
    restore() {
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("distinct multi-hero falls get distinct IDs while undo/JSON replay retains its ID", () => {
  const before = {
    originalSeed: 7,
    scenarioId: "anduin",
    log: [{ id: 1 }],
  } as GameState;
  const after = {
    round: 2,
    stage: 2,
    victoryCards: [],
    log: [{ id: 1 }, { id: 10 }, { id: 11 }],
  } as unknown as GameState;
  const moment = {
    kind: "hero-fall" as const,
    title: "2 heroes have fallen",
    subtitle: "Aragorn · Glóin",
  };
  const id = significantAudioId(before, after, moment);
  assert.equal(
    significantAudioId(
      JSON.parse(JSON.stringify(before)),
      JSON.parse(JSON.stringify(after)),
      { ...moment },
    ),
    id,
  );
  assert.notEqual(
    significantAudioId(before, after, {
      ...moment,
      subtitle: "Gimli · Legolas",
    }),
    id,
  );
  assert.notEqual(
    significantAudioId(
      before,
      { ...after, log: [{ id: 20 }, { id: 21 }] as GameState["log"] },
      moment,
    ),
    id,
  );
  assert.notEqual(
    significantAudioId({ ...before, originalSeed: 8 }, after, moment),
    id,
    "a fresh retry seed starts its own journey",
  );
});

test("spoken preferences use a low default and reject corrupt/non-finite values", () => {
  assert.deepEqual(parseAudioPreferences(null), { muted: false, volume: 0.3 });
  assert.deepEqual(parseAudioPreferences("oops"), DEFAULT_AUDIO);
  assert.deepEqual(parseAudioPreferences('{"muted":true,"volume":8}'), {
    muted: true,
    volume: 1,
  });
  assert.deepEqual(parseAudioPreferences('{"volume":-2}'), {
    muted: false,
    volume: 0,
  });
});
test("no gesture, hidden and muted events never catch up on later unlock/unmute", async () => {
  const e = environment();
  const p = new SignificantAudioPlayer(DEFAULT_AUDIO);
  try {
    p.announce("locked", "stage");
    p.unlock();
    p.announce("locked", "stage");
    p.setPreferences({ muted: true, volume: 0.3 });
    p.announce("muted", "victory");
    p.setPreferences(DEFAULT_AUDIO);
    p.announce("muted", "victory");
    e.hide();
    p.announce("hidden", "defeat");
    e.show();
    p.announce("hidden", "defeat");
    await settle();
    assert.deepEqual(e.requests, []);
    p.announce("fresh", "stage");
    await settle();
    assert.deepEqual(e.starts, ["/audio/quest-advance.mp3"]);
    assert.equal(e.volume, 0.3);
  } finally {
    p.dispose();
    e.restore();
  }
});
test("rerenders/repeated events and a recreated player cannot replay a remembered milestone", async () => {
  const e = environment();
  const p = new SignificantAudioPlayer(DEFAULT_AUDIO);
  let reloaded: SignificantAudioPlayer | undefined;
  try {
    p.unlock();
    p.announce("logical-stage", "stage");
    await settle();
    p.announce("logical-stage", "stage");
    p.stop();
    p.announce("logical-stage", "stage");
    p.dispose();
    reloaded = new SignificantAudioPlayer(DEFAULT_AUDIO);
    reloaded.unlock();
    reloaded.announce("logical-stage", "stage");
    await settle();
    assert.equal(e.starts.length, 1);
  } finally {
    p.dispose();
    reloaded?.dispose();
    e.restore();
  }
});
test("rapid milestones keep one pending cue and endgame immediately supersedes both", async () => {
  const e = environment();
  const p = new SignificantAudioPlayer(DEFAULT_AUDIO);
  try {
    p.unlock();
    p.announce("stage", "stage");
    await settle();
    p.announce("side-a", "side-quest");
    p.announce("hero-a", "hero-fall");
    assert.equal(e.starts.length, 1);
    p.announce("won", "victory");
    await settle();
    assert.equal(e.sources[0].stopped, true);
    assert.deepEqual(e.starts, [
      "/audio/quest-advance.mp3",
      "/audio/victory.mp3",
    ]);
    p.announce("late-side", "side-quest");
    e.sources.at(-1)!.end();
    await settle();
    assert.equal(e.starts.length, 2);
  } finally {
    p.dispose();
    e.restore();
  }
});
test("the latest pending cue starts after current audio ends, without overlap", async () => {
  const e = environment();
  const p = new SignificantAudioPlayer(DEFAULT_AUDIO);
  try {
    p.unlock();
    p.announce("a", "stage");
    await settle();
    p.announce("b", "side-quest");
    p.announce("c", "hero-fall");
    e.sources[0].end();
    await settle();
    assert.deepEqual(e.starts, [
      "/audio/quest-advance.mp3",
      "/audio/hero-fall.mp3",
    ]);
  } finally {
    p.dispose();
    e.restore();
  }
});
test("mute, hidden tab, and disposal cancel both playback and delayed decodes", async () => {
  const e = environment();
  const p = new SignificantAudioPlayer(DEFAULT_AUDIO);
  try {
    p.unlock();
    p.announce("playing", "stage");
    await settle();
    p.setPreferences({ muted: true, volume: 0.3 });
    assert.equal(e.sources[0].stopped, true);
    p.setPreferences(DEFAULT_AUDIO);
    e.delay();
    p.announce("loading", "hero-fall");
    await settle();
    p.hide();
    e.pending.get("/audio/hero-fall.mp3")!();
    await settle();
    assert.equal(e.starts.length, 1);
    p.unlock();
    p.announce("disposing", "defeat");
    await settle();
    p.dispose();
    e.pending.get("/audio/defeat.mp3")!();
    await settle();
    assert.equal(e.starts.length, 1);
    assert.equal(e.closed, true);
  } finally {
    p.dispose();
    e.restore();
  }
});
test("a slow stage load cannot start over a later endgame cue", async () => {
  const e = environment();
  const p = new SignificantAudioPlayer(DEFAULT_AUDIO);
  try {
    p.unlock();
    e.delay();
    p.announce("slow-stage", "stage");
    await settle();
    p.announce("lost", "defeat");
    await settle();
    e.pending.get("/audio/defeat.mp3")!();
    await settle();
    e.pending.get("/audio/quest-advance.mp3")!();
    await settle();
    assert.deepEqual(e.starts, ["/audio/defeat.mp3"]);
  } finally {
    p.dispose();
    e.restore();
  }
});
