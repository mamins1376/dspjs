/// <reference path="../../node_modules/types-web/baselines/audioworklet.generated.d.ts" />

import "./decoder";

import { Frequency, isMessageData, Module, Ready, Time, workletId } from "../audio/message";

import initialize, { Analyzer } from "../../target/wasm-pack/wasm";

class CustomWorklet extends AudioWorkletProcessor {
  analyzer?: Analyzer;

  constructor() {
    super();

    this.port.addEventListener("message", this.message.bind(this));
    this.port.start();
  }

  message({ data }: MessageEvent) {
    if (!isMessageData(data))
      throw new TypeError(`Invalid message data on worklet thread: ${data}`)

    if (Module.check(data)) {
      const ready = (error?: string) => this.port.postMessage(Ready.make(error));
      initialize(data.module)
        .then(() => ready())
        .catch((reason: string) => ready(reason));
    }
  }

  process([input,]: Float32Array[][]) {
    if (input.length) {
      this.analyzer ??= new Analyzer(2048);

      if (this.analyzer.feed(input[0])) {
        let buffer = new Float32Array(2048);
        this.analyzer.time(buffer);
        this.port.postMessage(Time.make(buffer), [buffer.buffer]);

        buffer = new Float32Array(2048);
        this.analyzer.frequency(buffer);
        this.port.postMessage(Frequency.make(buffer), [buffer.buffer]);
      }
    }

    return input.length !== 0;
  }
}

registerProcessor(workletId, CustomWorklet as any);
