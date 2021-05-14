import initialize, { Processor } from "../target/wasm-pack/processor";

enum AudioError {
  NotStarted = "NOT_STARTED",
  Insecure = "مطمئن شوید این صفحه با پروتکل امن http<strong>s</strong>) بارگزاری شده است.",
  Unsupported = "متأسفانه مروگر شما پشتیبانی نمی‌شود. لطفاً از فایرفاکس ۷۶ یا جدیدتر، و یا کروم ۶۵ یا جدیدتر استفاده کنید.",
}

type EffectNode = AudioWorkletNode | ScriptProcessorNode;

export default class Audio {
  private _is_open = false;
  private _is_started = false;

  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private effect?: EffectNode;

  async open() {
    if (this._is_open)
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

    this._is_open = true;
  }

  start() {
    if (!this._is_open)
      throw AudioError.NotStarted;

    if (!this._is_started) {
      this._is_started = true;

      this.source!.connect(this.effect!);
      this.effect!.connect(this.context!.destination);
    }
  }

  panic() {
    this.effect?.dispatchEvent(new Event("panic"));
  }

  stop() {
    if (!this._is_open)
      throw AudioError.NotStarted;

    if (this._is_started) {
      this._is_started = false;

      this.source!.disconnect(this.effect!);
      this.effect!.disconnect(this.context!.destination);
    }
  }

  async close() {
    if (!this._is_open)
      return;

    if (this._is_started)
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

    this._is_open = false;
  }

  get is_open() {
    return this._is_open;
  }

  get is_started() {
    return this._is_started;
  }
}

async function makeEffectNode(context: AudioContext): Promise<EffectNode> {
  const url = new URL("processor.wasm", window.location.href);

  if (context.audioWorklet?.addModule) {
    const response = await fetch(url.href);
    const buffer = await response.arrayBuffer();

    await context.audioWorklet.addModule("worklet.js");
    const effect = new AudioWorkletNode(context, "effect-processor");

    const container: { handler?: EventListener } = {};
    type Resolver = (arg: any) => void;
    const initialized: Promise<void> = new Promise((resolve: Resolver, reject: Resolver) => {
      container.handler = ((content: MessageEvent) => {
        const map: any = { resolve, reject };
        const { type, error } = content.data;
        if (map.hasOwnProperty(type))
          (map[type])(error);
        else
          console.error("invalid message:", content.data);
      }) as EventListener;
      effect.port.addEventListener("message", container.handler);
    })

    effect.port.start();
    effect.port.postMessage({ type: "processor", buffer });

    try {
      await initialized;

      (effect as EventTarget).removeEventListener("message", container.handler!);

      effect.addEventListener("panic", () => effect.port.postMessage({ type: "panic" }));
      return effect;
    } catch (e) {
      console.warn("falling back to ScriptProcessorNode since AudioWorklet initialization failed:", e);
    }
  }

  await initialize(url);

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
