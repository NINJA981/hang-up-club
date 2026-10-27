/**
 * A hand-rolled stand-in for the parts of the Web Audio API the engine uses.
 * It records what was scheduled, so tests can assert exact `start(when)` times
 * without any sound (ADR §5: "hand-rolled stub recording start(when) calls").
 */

export class FakeParam {
  value = 1;
  calls: { fn: string; args: number[] }[] = [];
  setTargetAtTime(target: number, at: number, tc: number): void {
    this.calls.push({ fn: 'setTargetAtTime', args: [target, at, tc] });
  }
  cancelScheduledValues(at: number): void {
    this.calls.push({ fn: 'cancelScheduledValues', args: [at] });
  }
}

export class FakeNode {
  connections: unknown[] = [];
  connect(to: unknown): unknown {
    this.connections.push(to);
    return to;
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam();
}

export class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  startedAt: number | undefined;
  stoppedAt: number | undefined;
  start(when: number): void {
    this.startedAt = when;
  }
  stop(when?: number): void {
    if (this.startedAt === undefined) throw new Error('InvalidStateError: not started');
    this.stoppedAt = when ?? 0;
  }
}

export class FakeOscillator extends FakeSource {
  type = 'sine';
  frequency = new FakeParam();
}

export interface FakeBuffer {
  duration: number;
  id: string;
  getChannelData(): Float32Array;
}

export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8000;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  destination = new FakeNode();
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  oscillators: FakeOscillator[] = [];
  decoded: string[] = [];
  resumed = 0;
  closed = false;
  /** Bytes for which decodeAudioData should reject. */
  failDecodeFor = new Set<string>();

  resume(): Promise<void> {
    this.resumed++;
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createDynamicsCompressor(): FakeNode & {
    threshold: FakeParam;
    ratio: FakeParam;
    attack: FakeParam;
    release: FakeParam;
  } {
    return Object.assign(new FakeNode(), {
      threshold: new FakeParam(),
      ratio: new FakeParam(),
      attack: new FakeParam(),
      release: new FakeParam(),
    });
  }
  createBiquadFilter(): FakeNode & { type: string; frequency: FakeParam; Q: FakeParam } {
    return Object.assign(new FakeNode(), { type: '', frequency: new FakeParam(), Q: new FakeParam() });
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createOscillator(): FakeOscillator {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o;
  }
  createBuffer(_channels: number, length: number, rate: number): FakeBuffer {
    return {
      duration: length / rate,
      id: `click-${String(length)}`,
      getChannelData: () => new Float32Array(length),
    };
  }
  decodeAudioData(bytes: ArrayBuffer): Promise<FakeBuffer> {
    const id = new TextDecoder().decode(bytes);
    if (this.failDecodeFor.has(id)) return Promise.reject(new Error('EncodingError'));
    this.decoded.push(id);
    return Promise.resolve({ duration: 1, id, getChannelData: () => new Float32Array(1) });
  }
}

export const asCtx = (c: FakeAudioContext): AudioContext => c as unknown as AudioContext;
export const bytesOf = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;
