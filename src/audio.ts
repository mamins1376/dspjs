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
  private visualyser?: VisualiserNode;

  get state() {
    return this.is_started ? State.Running :
      this.is_open ? State.Open : State.Closed;
  }

  panic() {
    if (this.state !== State.Closed)
      this.effect?.dispatchEvent(new Event("panic"));
  }

  async open(canvas: HTMLCanvasElement) {
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

    this.visualyser ??= new VisualiserNode(this.context, canvas);

    this.is_open = true;
  }

  start() {
    if (!this.is_open)
      throw AudioError.NotStarted;

    if (!this.is_started) {
      this.is_started = true;

      this.source!.connect(this.effect!);
      this.effect!.connect(this.visualyser!);
      this.visualyser!.connect(this.context!.destination);
    }
  }

  stop() {
    if (!this.is_open)
      throw AudioError.NotStarted;

    if (this.is_started) {
      this.is_started = false;

      this.source!.disconnect(this.effect!);
      this.effect!.disconnect(this.visualyser!);
      this.visualyser!.disconnect(this.context!.destination);
    }
  }

  async close() {
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
    delete this.visualyser;

    if (this.context)
      await this.context.close();
    delete this.context;

    this.is_open = false;
  }

  recanvas(canvas?: HTMLCanvasElement) {
    this.visualyser?.recanvas(canvas);
  }
}

class VisualiserNode extends AnalyserNode {
  private buffer: Uint8Array;
  private renderingContext!: CanvasRenderingContext2D;

  constructor(context: BaseAudioContext, canvas: HTMLCanvasElement, options?: AnalyserOptions) {
    super(context, options);

    this.buffer = new Uint8Array(this.frequencyBinCount);

    this.recanvas(canvas);

    this.draw(0);
  }

  recanvas(canvas?: HTMLCanvasElement) {
    canvas ??= this.renderingContext.canvas;

    const renderingContext = canvas.getContext("2d");
    if (!renderingContext)
      throw new TypeError("Cannot get rendering context for visualiser canvas");
    this.renderingContext = renderingContext;
    renderingContext.fillStyle = "#aad8d3";
    renderingContext.strokeStyle = "#393e46";
    renderingContext.lineWidth = 2;
  }

  private draw(_time: DOMHighResTimeStamp) {
    requestAnimationFrame(this.draw.bind(this));

    this.getByteTimeDomainData(this.buffer);

    const c = this.renderingContext
    const [width, height] = [c.canvas.width, c.canvas.height];

    c.fillRect(0, 0, width, height);

    c.beginPath();

    var sliceWidth = width * 1.0 / this.buffer.length;
    var x = 0;

    for(var i = 0; i < this.buffer.length; i++) {

      var v = this.buffer[i] / 128.0;
      var y = v * height / 2;

      if(i === 0) {
        c.moveTo(x, y);
      } else {
        c.lineTo(x, y);
      }

      x += sliceWidth;
    }

    c.lineTo(width, height / 2);
    c.stroke();
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
