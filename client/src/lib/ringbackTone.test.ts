import assert from "node:assert/strict";
import test from "node:test";

import { createRingbackToneController } from "./ringbackTone";

function createFakeScheduler() {
  let nextId = 1;
  const timers = new Map<number, { delay: number; callback: () => void }>();

  return {
    setTimeout(callback: () => void, delay: number) {
      const id = nextId++;
      timers.set(id, { delay, callback });
      return id;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
    runNext() {
      const next = [...timers.entries()].sort((left, right) => {
        if (left[1].delay !== right[1].delay) {
          return left[1].delay - right[1].delay;
        }

        return left[0] - right[0];
      })[0];

      if (!next) {
        throw new Error("No timer scheduled.");
      }

      timers.delete(next[0]);
      next[1].callback();
      return next[1].delay;
    },
    get pendingCount() {
      return timers.size;
    },
    get pendingDelays() {
      return [...timers.values()].map((timer) => timer.delay);
    },
  };
}

function createFakeAudioContext() {
  const gainNode = {
    gain: { value: 0 },
    connectCalls: 0,
    disconnectCalls: 0,
    connect() {
      this.connectCalls += 1;
    },
    disconnect() {
      this.disconnectCalls += 1;
    },
  };

  const oscillators: Array<{
    frequency: { value: number };
    type: OscillatorType;
    startCalls: number;
    stopCalls: number;
    disconnectCalls: number;
    connected: boolean;
    connect(target: unknown): void;
    start(): void;
    stop(): void;
    disconnect(): void;
  }> = [];

  return {
    destination: {},
    gainNode,
    oscillators,
    resumeCalls: 0,
    closeCalls: 0,
    createGain() {
      return gainNode;
    },
    createOscillator() {
      const oscillator = {
        frequency: { value: 0 },
        type: "sine" as OscillatorType,
        startCalls: 0,
        stopCalls: 0,
        disconnectCalls: 0,
        connected: false,
        connect(target: unknown) {
          this.connected = Boolean(target);
        },
        start() {
          this.startCalls += 1;
        },
        stop() {
          this.stopCalls += 1;
        },
        disconnect() {
          this.disconnectCalls += 1;
        },
      };

      oscillators.push(oscillator);
      return oscillator;
    },
    resume() {
      this.resumeCalls += 1;
      return Promise.resolve();
    },
    close() {
      this.closeCalls += 1;
      return Promise.resolve();
    },
  };
}

test("plays ringback cadence until stopped", () => {
  const scheduler = createFakeScheduler();
  const audioContext = createFakeAudioContext();
  const controller = createRingbackToneController({
    createAudioContext: () => audioContext,
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
  });

  controller.start();

  assert.equal(controller.isPlaying(), true);
  assert.equal(audioContext.resumeCalls, 1);
  assert.equal(audioContext.oscillators.length, 2);
  assert.deepEqual(
    audioContext.oscillators.map((oscillator) => oscillator.frequency.value),
    [440, 480],
  );
  assert.equal(audioContext.gainNode.gain.value > 0, true);
  assert.deepEqual(scheduler.pendingDelays, [2000]);

  const firstDelay = scheduler.runNext();
  assert.equal(firstDelay, 2000);
  assert.equal(audioContext.gainNode.gain.value, 0);
  assert.deepEqual(scheduler.pendingDelays, [4000]);

  const secondDelay = scheduler.runNext();
  assert.equal(secondDelay, 4000);
  assert.equal(audioContext.gainNode.gain.value > 0, true);

  controller.stop();

  assert.equal(controller.isPlaying(), false);
  assert.equal(audioContext.closeCalls, 1);
  assert.equal(audioContext.gainNode.gain.value, 0);
  assert.equal(audioContext.gainNode.disconnectCalls, 1);
  assert.equal(audioContext.oscillators.every((oscillator) => oscillator.stopCalls === 1), true);
  assert.equal(audioContext.oscillators.every((oscillator) => oscillator.disconnectCalls === 1), true);
  assert.equal(scheduler.pendingCount, 0);
});
