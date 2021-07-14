/// <reference path="../../node_modules/types-web/baselines/audioworklet.generated.d.ts" />

import "./text-decoder";

import { isMessageData, Module, Panic, Ready } from "../audio/message";

import initialize, { Processor } from "../../target/wasm-pack/wasm";

class CustomWorklet extends AudioWorkletProcessor {
  processors?: Processor[];

  constructor() {
    super();

    this.port.addEventListener("message", this.message.bind(this));
    this.port.start();
  }

  message({ data }: MessageEvent) {
    if (!isMessageData(data))
      throw new TypeError(`Invalid message data on worklet thread: ${data}`)

    if (Panic.check(data)) {
      this.panic();
    } else if (Module.check(data)) {
      const ready = (error?: string) => this.port.postMessage(Ready.make(error));
      initialize((data as Module.Message).module)
        .then(() => ready())
        .catch((reason: string) => ready(reason));
    }
  }

  process([input,]: Float32Array[][], [output,]: Float32Array[][]) {
    const n = input.length; // number of channels

    if (n === 0 || n !== output.length)
      return false;

    if (!this.processors || this.processors.length !== n)
      this.processors = Array(n).fill(null)
        .map(_ => new Processor(sampleRate));

    this.processors.forEach((p, k) => p.process(input[k], output[k]));

    return true;
  }

  panic() {
    if (this.processors)
      this.processors.forEach(p => p.panic());
  }
}

registerProcessor(Processor.id(), CustomWorklet as any);
