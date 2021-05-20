export const enum State {
  Closed = 0,
  Open = 1,
  Running = 2,
}

enum AudioError {
  NotStarted = "NOT_STARTED",
  Insecure = "مطمئن شوید این صفحه با پروتکل امن http<strong>s</strong>) بارگزاری شده است.",
  Unsupported = "متأسفانه مروگر شما پشتیبانی نمی‌شود. لطفاً از فایرفاکس ۷۶ یا جدیدتر، و یا کروم ۶۵ یا جدیدتر استفاده کنید.",
}

type EffectNode = AudioWorkletNode | ScriptProcessorNode;

export default class Audio {
  private is_open = false;
  private is_started = false;

  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private effect?: EffectNode;

  get state() {
    return this.is_started ? State.Running :
      this.is_open ? State.Open : State.Closed;
  }

  async go(state: State) {
    if (this.state === state)
      return;

    if (this.state === State.Closed) {
      await this.open();
      if (state === State.Running)
        this.start();
    } else if (state === State.Closed) {
      await this.close();
    } else if (state === State.Running) {
      this.start();
    } else {
      this.stop();
    }
  }

  panic() {
    if (this.state !== State.Closed)
      this.effect?.dispatchEvent(new Event("panic"));
  }

  private async open() {
    if (this.is_open)
      return;

    if (!(
      navigator.mediaDevices &&
      AudioContext &&
      (AudioWorkletNode || ScriptProcessorNode)
    ))
      throw isSecureContext === false ?
        AudioError.Insecure :
        AudioError.Unsupported;

    this.context ??= new AudioContext();

    this.stream ??= await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
      }
    });

    this.source ??= this.context.createMediaStreamSource(this.stream);

    this.effect ??= await makeEffectNode(this.context);

    this.is_open = true;
  }

  private start() {
    if (!this.is_open)
      throw AudioError.NotStarted;

    if (!this.is_started) {
      this.is_started = true;

      this.source!.connect(this.effect!);
      this.effect!.connect(this.context!.destination);
    }
  }

  private stop() {
    if (!this.is_open)
      throw AudioError.NotStarted;

    if (this.is_started) {
      this.is_started = false;

      this.source!.disconnect(this.effect!);
      this.effect!.disconnect(this.context!.destination);
    }
  }

  private async close() {
    if (!this.is_open)
      return;

    if (this.is_started)
      this.stop();

    if (this.stream)
      this.stream.getTracks()
        .forEach(track => track.stop());
    delete this.stream;

    delete this.source;
    delete this.effect;

    if (this.context)
      await this.context.close();
    delete this.context;

    this.is_open = false;
  }
}

async function makeEffectNode(context: AudioContext): Promise<EffectNode> {
  const worklet = await makeWorkletNode(context);
  if (worklet)
    return worklet;

  let processors = [0, 0].map(_ => new Processor(context.sampleRate));
  const effect = context.createScriptProcessor();

  effect.addEventListener("audioprocess", (event: any) => {
    let { inputBuffer, outputBuffer } = event;
    for (let c = 0; c < outputBuffer.numberOfChannels; c++) {
      const x = inputBuffer.getChannelData(c);
      const y = outputBuffer.getChannelData(c);
      processors[c].process(x, y);
    }
  });

  effect.addEventListener("panic", () => processors.forEach(p => p.panic()));

  return effect;
}

async function makeWorkletNode(context: AudioContext): Promise<AudioWorkletNode | void> {
  if (!context.audioWorklet)
    return;

  let effect: AudioWorkletNode;
  try {
    await context.audioWorklet.addModule("worklet.js");
    effect = new AudioWorkletNode(context, Processor.id);
  } catch (e) {
    console.warn("AudioWorklet init failed:", e);
    return;
  }

  effect.addEventListener("panic", () => effect.port.postMessage({ type: "panic" }));
  return effect;
}

export class Processor {
  static id = "custom-worklet";

  buffer: Float32Array;
  position: Iterable<number>;

  constructor(rate: number) {
    const length = 1 * rate; // one second delay
    this.buffer = new Float32Array(length);
    const position = cycle(length);
    position.return = value => ({ value, done: true });
    this.position = position;
  }

  process(x: Float32Array, y: Float32Array) {
    // x is input buffer, y is output buffer:
    //      ┌───┐
    // x ───► + ├─────────────────────┬─► y
    //      └─▲─┘                     │
    //        │  ┌───────┐  ┌──────┐  │
    //       d└──┤ DELAY ◄──┤ -3dB ◄──┘
    //           └───────┘  └──────┘
    for (const [i, p] of limit_enumerate(y.length, this.position)) {
      y[i] = x[i] + this.buffer[p];
      this.buffer[p] = y[i] * 0.707;
    }
  }

  panic() {
    this.buffer.fill(0);
  }
}

function * cycle(period: number): Generator<number, void> {
  while (true)
    for (let i = 0; i < period; i++)
      yield i;
}

function * limit_enumerate<T>(n: number, iter: Iterable<T>): Generator<[number, T], void> {
  let i = 0;
  for (const v of iter) {
    yield [i, v];
    if (++i === n)
      break;
  }
}
