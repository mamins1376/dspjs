import "./shim";

import { Ready, isMessageData, Module, workletId, Change, Time, Frequency } from "./message";

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
  private analyser?: WorkletAnalyzerNode;
  private visualyser?: Visualizer;
  private muter?: GainNode;

  get state() {
    return this.is_started ? State.Running :
      this.is_open ? State.Open : State.Closed;
  }

  async open(canvases: Canvases, fftSize: number) {
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

    this.analyser ??= await WorkletAnalyzerNode.make(this.context, { fftSize });

    this.muter = this.context.createGain();
    this.muter.gain.value = 0;

    this.visualyser ??= new Visualizer(this.analyser, canvases);

    this.is_open = true;
  }

  start() {
    if (!this.is_open)
      throw AudioError.NotStarted;

    if (!this.is_started) {
      this.is_started = true;

      this.source!.connect(this.analyser!);
      this.analyser!.connect(this.muter!);
      this.muter!.connect(this.context!.destination);

      this.visualyser!.start();
    }
  }

  stop() {
    if (!this.is_open)
      throw AudioError.NotStarted;

    if (this.is_started) {
      this.is_started = false;

      this.source!.disconnect();
      this.analyser!.disconnect();
      this.muter!.disconnect();

      this.visualyser!.stop();
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
    delete this.analyser;

    this.visualyser?.recanvas();
    delete this.visualyser;

    delete this.muter;

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

class Visualizer {
  private analyser: AnalyserNode;
  private drawers: [Waveform, Spectrum, Spectrogram];
  private draw_handle?: number;

  constructor(analyzer: AnalyserNode, canvases: Canvases) {
    this.analyser = analyzer;

    const [waveformCanvas, spectrumCanvas, spectrogramCanvas] = canvases;
    const waveform = new Waveform(waveformCanvas, analyzer.fftSize);
    const spectrum = new Spectrum(spectrumCanvas, analyzer.frequencyBinCount);
    const spectrogram = new Spectrogram(spectrogramCanvas, analyzer.frequencyBinCount);
    this.drawers = [waveform, spectrum, spectrogram];
  }

  recanvas(canvases?: Canvases) {
    this.drawers.map((v, i) => v.recanvas(canvases && canvases[i]));
  }

  start() {
    if (this.draw_handle === undefined)
      this.draw(0);
  }

  stop() {
    if (this.draw_handle !== undefined) {
      cancelAnimationFrame(this.draw_handle);
      delete this.draw_handle;
    }
  }

  private draw(time: DOMHighResTimeStamp) {
    this.draw_handle = requestAnimationFrame(this.draw.bind(this));

    const [waveform, spectrum, spectrogram] = this.drawers;
    waveform.draw(time, this.analyser.getByteTimeDomainData.bind(this.analyser));
    spectrum.draw(time, this.analyser.getByteFrequencyData.bind(this.analyser));
    spectrogram.draw(time, this.analyser.getByteFrequencyData.bind(this.analyser));
  }
}

class Waveform {
  private buffer: Uint8Array;
  private context!: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement, length: number) {
    this.recanvas(canvas);
    this.buffer = new Uint8Array(length);
  }

  recanvas(canvas?: HTMLCanvasElement) {
    canvas ??= this.context.canvas;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

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

class Spectrum {
  private buffer: Uint8Array;
  private context!: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement, length: number) {
    this.recanvas(canvas);
    this.buffer = new Uint8Array(length);
  }

  recanvas(canvas?: HTMLCanvasElement) {
    canvas ??= this.context.canvas;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

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

    const entries = this.buffer.entries();
    const x_scale = width * 1.0 / Math.log10(this.buffer.length - 1);
    entries.next();
    for (const [i, v] of entries) {
      const x = Math.log10(i) * x_scale;
      const y = (1 - v / 255.0) * height;
      i ? context.lineTo(x, y) : context.moveTo(x, y);
    }

    context.lineTo(width, height);
    context.stroke();
  }
}

class Spectrogram {
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
      //context.fillStyle = "black";
      context.fillRect(0, 0, width, 1);

      if (width > 0 && height > 0)
        this.data = context.getImageData(0, 0, width, height);
      else
        return;
    }

    const { data } = this.data;
    data.copyWithin(context.canvas.width << 2, 0);

    const a = Math.pow(this.buffer.length - 1, 1.0 / (width - 1));
    let f = 1;
    for (let i = 0; i < width; i++) {
      const v = Spectrogram.interpolate(this.buffer, f);
      f *= a;

      const j = i << 2, l = v / 255.0, h = (0 + l) / 5;
      const q = l < 0.5 ? l * 2 : 1, p = 2 * l - q;
      data[j  ] = 255 * Spectrogram.hue2rgb(p, q, h + 1 / 3);
      data[j+1] = 255 * Spectrogram.hue2rgb(p, q, h);
      data[j+2] = 255 * Spectrogram.hue2rgb(p, q, h - 1 / 3);
    }

    this.context.putImageData(this.data, 0, 0);
  }

  private static interpolate(b: Uint8Array, x: number): number {
    const h = Math.ceil(x), l = h - 1, d = x - l;
    const H = b[h], L = b[l];
    return L + (H - L) * d;
  }

  private static hue2rgb(p: number, q: number, t: number): number {
    t = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    return t < 1 / 6 ? p + (q - p) * 6 * t
      : t < 1 / 2 ? q
      : t < 2 / 3 ? p + (q - p) * 6 * (2 / 3 - t)
      : p;
  }
}

class WorkletAnalyzerNode extends AudioWorkletNode implements AnalyserNode {
  private len: number;

  get fftSize() {
    return this.len;
  }

  set fftSize(len: number) {
    //if ((len & (len - 1)) !== 0)
    //  throw new TypeError(`fftSize must be a power of 2: ${len}`);
    //if (len < 32 || len > 32768)
    //  throw new TypeError(`fftSize must be in range: ${len}`);
    this.len = len;
    this.port.postMessage(Change.make(this.options()));
  }

  get frequencyBinCount() {
    return this.len >> 1;
  }

  maxDecibels: number;
  minDecibels: number;
  smoothingTimeConstant: number;

  static async make(context: AudioContext, options?: AnalyserOptions): Promise<WorkletAnalyzerNode> {
    if (!context.audioWorklet)
      throw new TypeError("AudioWorklet API is not supported on this browser");

    await context.audioWorklet.addModule("index.js");

    const me = new WorkletAnalyzerNode(context, options);
    me.port.start();

    const url = new URL("wasm.wasm", window.location.href);
    const module = await (await fetch(url.href)).arrayBuffer();

    me.port.postMessage(Module.make(module, me.options()));

    while (true) {
      const { data } = await me.getMessage();
      if (!isMessageData(data))
        throw new TypeError(`Unexpected event data for "message": ${data}`);
      if (!Ready.check(data))
        throw new TypeError(`Unexpected message while waiting for initialize: ${data}`);
      const { error } = data;
      if (error !== undefined)
        throw new TypeError(`Error while initializing wasm module: ${error}`);
      break;
    }

    return me;
  }

  private async getMessage(): Promise<MessageEvent> {
    const container: { listener?: (ev: MessageEvent) => void } = {};
    const promise: Promise<MessageEvent> = new Promise((resolve) => {
      container.listener = resolve;
      this.port.addEventListener("message", resolve);
    });
    const result = await promise;
    this.port.removeEventListener("message", container.listener!);
    return result;
  }

  constructor(context: AudioContext, options?: AnalyserOptions) {
    super(context, workletId, options);
    this.len = options?.fftSize ?? 2048;
    this.maxDecibels = options?.maxDecibels ?? -30;
    this.minDecibels = options?.minDecibels ?? -100;
    this.smoothingTimeConstant = options?.smoothingTimeConstant ?? 0.8;

    this.bytes = Array(2) as Tuple<Uint8Array, 2>;
    this.bytes[0] = new Uint8Array(this.len);
    this.bytes[1] = new Uint8Array(this.len);

    this.port.addEventListener("message", ev => this.message(ev));
  }

  private options(): Module.Options {
    return {
      fftSize: this.len,
      maxDecibels: this.maxDecibels,
      minDecibels: this.minDecibels,
      smoothingTimeConstant: this.smoothingTimeConstant,
    }
  }

  private message({ data }: MessageEvent) {
    if (!isMessageData(data))
      throw new TypeError(`not valid message data: ${data}`)

    if (Time.check(data) || Frequency.check(data))
      this.setBuffer(Frequency.check(data), data.buffer);
  }

  private setBuffer(isFrequency: boolean, buffer: Uint8Array) {
    const [s, l] = [this.fftSize >> +isFrequency, buffer.length];
    if (l !== s) {
      const type = isFrequency ? "frequency" : "time";
      throw new TypeError(`${type} buffer size mismatch: ${l} (must be ${s})`)
    }
    this.bytes[+isFrequency] = buffer;
  }

  private bytes: Tuple<Uint8Array, 2>;

  getFloatTimeDomainData(_array: Float32Array) {}

  getFloatFrequencyData(_array: Float32Array) {}

  getByteTimeDomainData(array: Uint8Array) {
    array.set(this.bytes[0].slice(0, array.length));
  }

  getByteFrequencyData(array: Uint8Array) {
    array.set(this.bytes[1].slice(0, array.length));
  }
}
