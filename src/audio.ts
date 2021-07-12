export class Processor {
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

type _TupleOf<T, N extends number, R extends unknown[]> = R["length"] extends N ? R : _TupleOf<T, N, [T, ...R]>;
export type Tuple<T, N extends number> = N extends N ? number extends N ? T[] : _TupleOf<T, N, []> : never;

export const numCanvases = 3;
export type Canvases = Tuple<HTMLCanvasElement, typeof numCanvases>;

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

  async open(canvases: Canvases) {
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

    this.visualyser ??= new VisualiserNode(this.context, canvases);

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

  recanvas(canvases?: Canvases) {
    this.visualyser?.recanvas(canvases);
  }
}

interface GetData {
  (buffer: Uint8Array): void;
}

class VisualiserNode extends AnalyserNode {
  private visualisers: [WaveformVisualiser, SpectrumVisualiser, SpectrogramVisualiser];

  constructor(context: BaseAudioContext, canvases: Canvases, options?: AnalyserOptions) {
    super(context, options);

    const [waveformCanvas, spectrumCanvas, spectrogramCanvas] = canvases;
    const waveform = new WaveformVisualiser(waveformCanvas, this.fftSize);
    const spectrum = new SpectrumVisualiser(spectrumCanvas, this.frequencyBinCount);
    const spectrogram = new SpectrogramVisualiser(spectrogramCanvas, this.frequencyBinCount);
    this.visualisers = [waveform, spectrum, spectrogram];

    this.draw(0);
  }

  recanvas(canvases?: Canvases) {
    this.visualisers.map((v, i) => v.recanvas(canvases && canvases[i]));
  }

  private draw(time: DOMHighResTimeStamp) {
    requestAnimationFrame(this.draw.bind(this));

    const [waveform, spectrum, spectrogram] = this.visualisers;
    waveform.draw(time, this.getByteTimeDomainData.bind(this));
    spectrum.draw(time, this.getByteFrequencyData.bind(this));
    spectrogram.draw(time, this.getByteFrequencyData.bind(this));
  }
}

interface Visualiser {
  recanvas(canvas?: HTMLCanvasElement): void;
  draw(time: DOMHighResTimeStamp, getData: GetData): void;
}

class WaveformVisualiser implements Visualiser {
  private buffer: Uint8Array;
  private context!: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement, length: number) {
    this.recanvas(canvas);
    this.buffer = new Uint8Array(length);
  }

  recanvas(canvas?: HTMLCanvasElement) {
    canvas ??= this.context.canvas;

    const context = canvas.getContext("2d");
    if (!context)
      throw new TypeError("Cannot get rendering context for visualiser canvas");

    context.fillStyle = "#aad8d3";
    context.strokeStyle = "#393e46";
    context.lineWidth = 2;
    this.context = context;
  }

  draw(_time: DOMHighResTimeStamp, getData: GetData) {
    getData(this.buffer);

    const c = this.context
    const [width, height] = [c.canvas.width, c.canvas.height];

    c.fillRect(0, 0, width, height);

    c.beginPath();

    for (const [i, v] of this.buffer.entries()) {
      const x = i * width * 1.0 / this.buffer.length;
      const y = v * height / 255.0;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }

    c.lineTo(width, height / 2);
    c.stroke();
  }
}

class SpectrumVisualiser implements Visualiser {
  private buffer: Uint8Array;
  private context!: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement, length: number) {
    this.recanvas(canvas);
    this.buffer = new Uint8Array(length);
  }

  recanvas(canvas?: HTMLCanvasElement) {
    canvas ??= this.context.canvas;

    const context = canvas.getContext("2d");
    if (!context)
      throw new TypeError("Cannot get rendering context for visualiser canvas");

    context.fillStyle = "#aad8d3";
    context.strokeStyle = "#393e46";
    context.lineWidth = 2;
    this.context = context;
  }

  draw(_time: DOMHighResTimeStamp, getData: GetData) {
    getData(this.buffer);

    const c = this.context
    const [width, height] = [c.canvas.width, c.canvas.height];

    c.fillRect(0, 0, width, height);

    c.beginPath();

    for (const [i, v] of this.buffer.entries()) {
      const x = i * width * 1.0 / this.buffer.length;
      const y = (1 - v / 255.0) * height;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }

    c.lineTo(width, height);
    c.stroke();
  }
}

class SpectrogramVisualiser implements Visualiser {
  private buffer: Uint8Array;
  private context!: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement, length: number) {
    this.recanvas(canvas);
    this.buffer = new Uint8Array(length);
  }

  recanvas(canvas?: HTMLCanvasElement) {
    canvas ??= this.context.canvas;

    const context = canvas.getContext("2d");
    if (!context)
      throw new TypeError("Cannot get rendering context for visualiser canvas");

    context.fillStyle = "#aad8d3";
    context.strokeStyle = "#393e46";
    context.lineWidth = 2;
    this.context = context;
  }

  draw(_time: DOMHighResTimeStamp, getData: GetData) {
    getData(this.buffer);

    const c = this.context
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
