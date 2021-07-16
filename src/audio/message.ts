export namespace Ready {
  export type Message = { type: typeof type, error?: string };
  export const type = "ready";
  export const make = (error?: string): Message => (error ? { type, error } : { type });
  export const check = (message: any): message is Message => message?.type === type;
}

export namespace Module {
  export type Options = Required<Omit<AnalyserOptions, keyof AudioNodeOptions>>;
  export type Message = ReturnType<typeof make>;
  export const type = "module";
  export const make = (module: ArrayBuffer, options: Options) => ({ type, module, options });
  export const check = (message: any): message is Message => message?.type === type;
}

export namespace Change {
  export type Message = ReturnType<typeof make>;
  export const type = "resize";
  export const make = (options: Module.Options) => ({ type, options });
  export const check = (message: any): message is Message => message?.type === type;
}

export namespace Time {
  export type Message = ReturnType<typeof make>;
  export const type = "time";
  export const make = (buffer: Uint8Array) => ({ type, buffer });
  export const check = (message: any): message is Message => message?.type === type;
}

export namespace Frequency {
  export type Message = ReturnType<typeof make>;
  export const type = "frequency";
  export const make = (buffer: Uint8Array) => ({ type, buffer });
  export const check = (message: any): message is Message => message?.type === type;
}

export type MessageData = Ready.Message | Module.Message | Time.Message | Frequency.Message;
export const isMessageData = (data: any): data is MessageData =>
  [Ready.check, Module.check, Time.check, Frequency.check].some(f => f(data));

export const workletId = "custom-worklet";
