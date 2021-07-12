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

    this.visualyser?.recanvas();
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

class VisualiserNode extends AnalyserNode implements AudioNode {
  private visualisers: [WaveformVisualiser, SpectrumVisualiser, SpectrogramVisualiser];
  private draw_handle?: number;

  constructor(context: BaseAudioContext, canvases: Canvases, options?: AnalyserOptions) {
    super(context, options);

    const [waveformCanvas, spectrumCanvas, spectrogramCanvas] = canvases;
    const waveform = new WaveformVisualiser(waveformCanvas, this.fftSize);
    const spectrum = new SpectrumVisualiser(spectrumCanvas, this.frequencyBinCount);
    const spectrogram = new SpectrogramVisualiser(spectrogramCanvas, this.frequencyBinCount);
    this.visualisers = [waveform, spectrum, spectrogram];
  }

  recanvas(canvases?: Canvases) {
    this.visualisers.map((v, i) => v.recanvas(canvases && canvases[i]));
  }

  // initially i thought using typescript would save time catching bugs, but as
  // it turns out it is very powerful at wasting time over stupid and simple
  // matters.
  // I spent almost 2 hours fighting with the compiler over that function which
  // has more than one signature on the parent class.
  //
  // More info: https://stackoverflow.com/a/59538756/4491972
  connect(...args: any[]): AudioNode & void {
    // @ts-ignore
    const result = super.connect(...args);

    if (this.draw_handle === undefined)
      this.draw(0);

    return result;
  }

  disconnect(...args: any[]): void {
    // @ts-ignore
    super.disconnect(...args);

    if (this.draw_handle !== undefined) {
      cancelAnimationFrame(this.draw_handle);
      delete this.draw_handle;
    }
  }

  private draw(time: DOMHighResTimeStamp) {
    this.draw_handle = requestAnimationFrame(this.draw.bind(this));

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
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = "#393e46";
    context.lineWidth = 2;
    this.context = context;
  }

  draw(_time: DOMHighResTimeStamp, getData: GetData) {
    getData(this.buffer);

    const { context } = this;
    const { width, height } = context.canvas;

    context.fillRect(0, 0, width, height);

    context.beginPath();

    for (const [i, v] of this.buffer.entries()) {
      const x = i * width * 1.0 / this.buffer.length;
      const y = v * height / 255.0;
      i ? context.lineTo(x, y) : context.moveTo(x, y);
    }

    context.lineTo(width, height / 2);
    context.stroke();
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
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = "#393e46";
    context.lineWidth = 2;
    this.context = context;
  }

  draw(_time: DOMHighResTimeStamp, getData: GetData) {
    getData(this.buffer);

    const { context } = this;
    const { width, height } = context.canvas;

    context.fillRect(0, 0, width, height);

    context.beginPath();

    for (const [i, v] of this.buffer.entries()) {
      const x = i * width * 1.0 / this.buffer.length;
      const y = (1 - v / 255.0) * height;
      i ? context.lineTo(x, y) : context.moveTo(x, y);
    }

    context.lineTo(width, height);
    context.stroke();
  }
}

class SpectrogramVisualiser implements Visualiser {
  private buffer: Uint8Array;
  private data?: ImageData;
  private context!: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement, length: number) {
    this.buffer = new Uint8Array(length);
    this.recanvas(canvas);
  }

  recanvas(canvas?: HTMLCanvasElement) {
    canvas ??= this.context.canvas;

    canvas.width = this.buffer.length;
    canvas.height = canvas.offsetHeight * canvas.width / canvas.offsetWidth;

    const context = canvas.getContext("2d");
    if (!context)
      throw new TypeError("Cannot get rendering context for visualiser canvas");

    const { width, height } = canvas;
    context.fillStyle = "#aad8d3";
    context.fillRect(0, 0, width, height);
    this.context = context;

    delete this.data;
  }

  draw(_time: DOMHighResTimeStamp, getData: GetData) {
    getData(this.buffer);

    const { context } = this;
    const { width, height } = context.canvas;

    if (!this.data) {
      context.fillStyle = "black";
      context.fillRect(0, 0, width, 1);

      this.data = context.getImageData(0, 0, width, height);
    }

    const { data } = this.data;
    data.copyWithin(context.canvas.width << 2, 0);
    for (const [i, v] of this.buffer.entries()) {
      const l = v / 255.0, h = l / 6;
      const q = l < 0.5 ? l * 2 : 1, p = 2 * l - q;
      data[i << 2 + 0] = 255 * hue2rgb(p, q, h + 1 / 3);
      data[i << 2 + 1] = 255 * hue2rgb(p, q, h);
      data[i << 2 + 2] = 255 * hue2rgb(p, q, h - 1 / 3);
    }

    this.context.putImageData(this.data, 0, 0);
  }
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
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
