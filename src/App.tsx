/// <reference path="./highlight.d.ts" />

import Audio, { Canvases, numCanvases, State, Tuple } from "./audio";

import {
  useRef,
  useState,
  useLayoutEffect,
  useErrorBoundary,
  useEffect,
} from "preact/hooks";

import { h, RefObject } from "preact";

import AudioHighlight, { start, end } from "highlight:./wasm/lib:40,50";

export default () => (
  <div class="frame">
    <div><Window {...useErrorView()} /></div>
    <div class="credit">
      <div>کاری از محمدامین صامتی - استاد راهنما: دکتر معین احمدی<br/>دانشگاه صنعتی اراک - بهار ۱۴۰۰</div>
      <svg xmlns="http://www.w3.org/2000/svg" height="48" viewBox="0 0 22.418 19.917">
        <path d="m70.353 104.398-3.421 1.112v2.263H89.35v-2.225l-3.392-1.17z" style="fill:#005ba3;" transform="translate(-66.932 -87.857)"/>
        <path style="fill:#001a33;" d="M73.871 105.234s-.31-4.915-.277-7.557c.033-2.642.347-7.443.347-7.443l2.078-1.096s3.357 5.325 4.484 9.346c1.128 4.022 1.726 6.794 1.726 6.794h2.665s-3.452-8.61-4.406-10.65c-.954-2.042-4.24-6.771-4.24-6.771l-3.266 1.79s-.827 5.202-1.105 8.711c-.278 3.51-.549 6.808-.549 6.808z" transform="translate(-66.932 -87.857)"/>
        <path style="fill:#004d97;" d="M71.328 105.166s2.003-5.56 3.266-8.663c1.264-3.104 3.424-7.518 3.424-7.518l3.718.8s1.833 5.433 2.314 9.257c.48 3.824.844 6.236.844 6.236h-2.665s.53-4.344.404-6.976c-.127-2.632-1.33-7.51-1.33-7.51l-2.908-.8s-2.095 6.065-2.58 8.778c-.486 2.714-1.944 6.464-1.944 6.464z" transform="translate(-66.932 -87.857)"/>
        <path style="fill:#0073e6;" d="M71.328 105.166s3.066-5.827 5.297-8.297c2.23-2.47 6.688-5.632 6.688-5.632l4.166 2.455s-.55 4.455-.848 6.032c-.298 1.577-1.737 5.554-1.737 5.554h-2.665s1.584-2.528 2.496-5.304a48.434 48.434 0 0 0 1.422-5.518l-2.71-1.63s-3.03 1.975-5.212 5.045-4.354 7.363-4.354 7.363z" transform="translate(-66.932 -87.857)"/>
      </svg>
    </div>
  </div>
);

const pwd = "https://github.com/mamins1376/dspjs/blob/default/src";
const code_href = `${pwd}/audio.ts#L${start}-L${end}`;

const Window = ({ errored, ErrorView }: ErrorViewPack) => {
  const [refs, setHidden, graphs] = useGraphs();
  const canvases = () => refs.map(c => c.current).filter(c => c) as Canvases;
  const { state, pending, running, close, run, stop, recanvas, resize } = useAudio(canvases);
  const [fftSize, FFTSize] = useFFTSize();

  const [b1c, b1l, b2c, b2l] = {
    [State.Closed]: ["start", "شروع"],
    [State.Open]: ["panic", "ادامه", "stop", "بستن"],
    [State.Running]: ["stop", "توقف"],
  }[state];

  const b1p = running ? stop : run;

  useEffect(() => setHidden(state === State.Closed), [state]);

  useEffect(() => {
    const handler = () => recanvas(canvases());

    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, canvases());

  useEffect(() => void (state !== State.Closed && resize(fftSize)), [fftSize]);

  return (
    <div class="window">
      <div class="header">
        <h1>پردازنده سیگنال</h1>

        <Indicator {...{ pending, errored, running }} />
      </div>

      <div class="content">
        <ErrorView />

        <p>
          در حال حاضر، این برنامه به صدای شما افکت Feedback Delay را اضافه می‌کند.
          برای شروع، ‌به یک میکروفون نیاز دارید.
        </p>

        <p><strong>توجه!</strong> مطمئن
          شوید مسیر مستقیمی برای صدا بین بلندگو و میکروفون شما برقرار نیست.
          در غیر این صورت ممکن است با صدای سوت بلندی مواجه شوید.
        </p>

        <div class="buttons">
          <button class={b1c} onClick={_ => b1p(fftSize)} disabled={errored}>{b1l}</button>
          {b2l && !errored && <button class={b2c} onClick={close} >{b2l}</button>}
          { FFTSize }
        </div>

        { graphs }

        <p>
          حلقه اصلی پردازش در <a href={code_href}>این قسمت</a> از کد است:
          <AudioHighlight class="language-typescript" />
        </p>
      </div>
    </div>
  );
};

const Indicator = ({ pending, running, errored }: Record<string, boolean>) => {
  const [label, color] = [
    ["منتظر", "blue"], ["خطا", "red"], ["فعال", "green"], ["آماده", "blue"]
  ][pending ? 0 : errored ? 1 : running ? 2 : 3];
  return <span style={`background-color: var(--color-${color});`}>{label}</span>;
};

const useFFTSize = (): [number, h.JSX.Element] => {
  const [power, setPower] = useState(10);
  const size = 1 << power;
  return [size, (
    <div class="fft-size">
      <span>اندازه فوریه: { size } نقطه</span>
      <span>
        <button onClick={() => setPower(power + 1)} disabled={power >= 15}>▲</button>
        <button onClick={() => setPower(power - 1)} disabled={power <= 5}>▼</button>
      </span>
    </div>
  )];
}

type CanvasRefs = Tuple<RefObject<HTMLCanvasElement>, typeof numCanvases>;

const useGraphs: () => [CanvasRefs, (hidden: boolean) => void, h.JSX.Element] = () => {
  const refs = Array(numCanvases).fill(null).map(_ => useRef()) as CanvasRefs; 
  const ref: RefObject<HTMLDivElement> = useRef();

  const setHidden = (hidden: boolean) => {
    if (ref.current)
      ref.current.dataset.hidden = hidden.toString();
  };

  return [refs, setHidden, (
    <div ref={ref} class="graphs">
      { refs.map(r => <canvas ref={r} />) }
    </div>
  )];
}

const useAudio = (canvases: () => Canvases) => {
  const audio = useOnce(() => new Audio());
  const [error, setError] = useState(undefined as unknown);
  const [state, setState] = useState(audio.state);
  const [pending, setPending] = useState(false);

  setError(undefined);
  if (error) throw error;

  type Arrow = (...a: any) => any;
  const wrap = <F extends Arrow>(f: F) => (...a: Parameters<F>) => { (async () => {
    if (pending)
      return;

    try {
      // @ts-ignore
      const promise = f(...a);
      setPending(promise instanceof Promise);
      await promise;
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
      setState(audio.state);
    }
  })(); };

  const opened = state !== State.Closed;
  const running = state === State.Running;

  const open_inner = (s: number) => audio.open(canvases(), s);

  return {
    state, pending, opened, running,
    open: wrap((s: number) => !running && open_inner(s)),
    close: wrap(() => audio.close()),
    run: wrap(async (s: number) => { await open_inner(s); audio.start(); }),
    stop: wrap(() => audio.stop()),
    recanvas: audio.recanvas.bind(audio),
    resize: wrap(async (s: number) => {
      await audio.close();
      await audio.open(canvases(), s);
      if (running)
        audio.start();
    }),
  };
};

const useOnce = <T extends unknown>(init: () => T) => {
  const ref = useRef(undefined as T);
  return ref.current || (ref.current = init());
};

interface ErrorViewPack {
  errored: boolean;
  ErrorView: () => h.JSX.Element;
}

const useErrorView = (): ErrorViewPack => {
  type MaybeError = undefined | string | Error;
  const [error, resetError]: [MaybeError, () => void] = useErrorBoundary();
  const roller: RefObject<HTMLDivElement> = useRef();
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => roller.current && setHeight(
    error ? roller.current.offsetHeight : 0
  ) || void 0, [error]);

  const __html = useTruthy(error && (
    typeof error === "string" ? error :
    error.name !== "NotAllowedError" ? error.message :
    "برای استفاده از این برنامه، دسترسی به میکروفون لازم است."
  ) || "");

  return { errored: !!error, ErrorView: () => (
    <div class="error" style={{"max-height": height}}>
      <div ref={roller} class="roller">
        <div>
          <div><b>خطا!</b> <span dangerouslySetInnerHTML={{ __html }} /></div>
          <button class="dismiss" onClick={resetError}>باشه</button>
        </div>
      </div>
    </div>
  )};
};

const useTruthy = <T extends unknown>(value: T): T => {
  const ref = useRef(value);
  ref.current = value || ref.current;
  return ref.current;
}
