export namespace Ready {
  export type Message = ReturnType<typeof make>;
  export const type = "ready";
  export const make = (error?: string) => ({ type, error });
  export const check = (message: any): message is Message => message?.type === type;
}

export namespace Module {
  export type Message = ReturnType<typeof make>;
  export const type = "module";
  export const make = (module: ArrayBuffer) => ({ type, module });
  export const check = (message: any): message is Message => message?.type === type;
}

export namespace Time {
  export type Message = ReturnType<typeof make>;
  export const type = "time";
  export const make = (buffer: Float32Array) => ({ type, buffer });
  export const check = (message: any): message is Message => message?.type === type;
}

export namespace Frequency {
  export type Message = ReturnType<typeof make>;
  export const type = "frequency";
  export const make = (buffer: Float32Array) => ({ type, buffer });
  export const check = (message: any): message is Message => message?.type === type;
}

export type MessageData = Ready.Message | Module.Message | Time.Message | Frequency.Message;
export const isMessageData = (data: any): data is MessageData =>
  [Ready.check, Module.check, Time.check, Frequency.check].some(f => f(data));

export const workletId = "custom-worklet";
