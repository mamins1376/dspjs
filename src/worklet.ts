/// <reference path="../node_modules/types-web/baselines/audioworklet.generated.d.ts" />

import "./text-decoder";

import initialize, { Processor } from "../target/wasm-pack/processor";

import { register_id } from "./audio";

class CustomWorklet extends AudioWorkletProcessor {
  processors?: Processor[];

  constructor() {
    super();

    this.port.addEventListener("message", this.message.bind(this));
    this.port.start();
  }

  message(content: MessageEvent) {
    const type = content.data?.type;
    if (type === "panic") {
      this.panic()
    } else if (type === "processor") {
      initialize(content.data.buffer)
        .then(() => this.port.postMessage({ type: "resolve" }))
        .catch(error => this.port.postMessage({ type: "reject", error }));
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

registerProcessor(register_id, CustomWorklet as any);
