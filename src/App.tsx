/// <reference path="./highlight.d.ts" />

import Audio from "./audio";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  StateUpdater,
} from "preact/hooks";

import { h, Ref } from "preact";

import AudioHighlight, { start, end } from "highlight:./audio:160,172";

const pwd = "https://github.com/mamins1376/dspjs/blob/default/src";
const code_href = `${pwd}/audio.ts#L${start}-L${end}`;

const audio = new Audio();

const enum AppState { Ready, Opened, Started }

export default App;

function App() {
  return (
    <div class="frame">
      <div><Window /></div>
      <div class="credit">
        <div>کاری از محمدامین صامتی<br/>دانشگاه صنعتی اراک - بهار ۱۴۰۰</div>
        <svg xmlns="http://www.w3.org/2000/svg" height="48" viewBox="0 0 22.418 19.917">
          <path d="m70.353 104.398-3.421 1.112v2.263H89.35v-2.225l-3.392-1.17z" style="fill:#005ba3" transform="translate(-66.932 -87.857)"/>
          <path style="fill:#001a33" d="M73.871 105.234s-.31-4.915-.277-7.557c.033-2.642.347-7.443.347-7.443l2.078-1.096s3.357 5.325 4.484 9.346c1.128 4.022 1.726 6.794 1.726 6.794h2.665s-3.452-8.61-4.406-10.65c-.954-2.042-4.24-6.771-4.24-6.771l-3.266 1.79s-.827 5.202-1.105 8.711c-.278 3.51-.549 6.808-.549 6.808z" transform="translate(-66.932 -87.857)"/>
          <path style="fill:#004d97" d="M71.328 105.166s2.003-5.56 3.266-8.663c1.264-3.104 3.424-7.518 3.424-7.518l3.718.8s1.833 5.433 2.314 9.257c.48 3.824.844 6.236.844 6.236h-2.665s.53-4.344.404-6.976c-.127-2.632-1.33-7.51-1.33-7.51l-2.908-.8s-2.095 6.065-2.58 8.778c-.486 2.714-1.944 6.464-1.944 6.464z" transform="translate(-66.932 -87.857)"/>
          <path style="fill:#0073e6" d="M71.328 105.166s3.066-5.827 5.297-8.297c2.23-2.47 6.688-5.632 6.688-5.632l4.166 2.455s-.55 4.455-.848 6.032c-.298 1.577-1.737 5.554-1.737 5.554h-2.665s1.584-2.528 2.496-5.304a48.434 48.434 0 0 0 1.422-5.518l-2.71-1.63s-3.03 1.975-5.212 5.045-4.354 7.363-4.354 7.363z" transform="translate(-66.932 -87.857)"/>
        </svg>
      </div>
    </div>
  );
};

const Window = () => {
  const [failure, setFailure] = useState("");
  const [state, setState] = useState(AppState.Ready);

  const toggle = useCallback(async () => {
    if (audio.is_started) {
      audio.stop()
      setState(AppState.Opened);
    } else {
      if (!audio.is_open) {
        try {
          await audio.open();
        } catch (error) {
          if (typeof error === "string") {
            setFailure(error);
          } else if (error?.name === "NotAllowedError") {
            setFailure("برای استفاده از این برنامه، دسترسی به میکروفون لازم است.");
          } else {
            setFailure(error.message)
            console.log(error);
          }
        }
      }

      if (audio.is_open) {
        audio.start();
        setState(AppState.Started);
      }
    }
  }, []);

  const panic = useCallback(async () => {
    if (audio.is_started) {
      audio.panic();
    } else {
      await audio.close();
      setState(AppState.Ready);
    }
  }, []);

  const [b1c, b1l, b2c, b2l] = {
    [AppState.Ready]: ["start", "شروع", undefined, undefined],
    [AppState.Opened]: ["panic", "ادامه", "stop", "بستن"],
    [AppState.Started]: ["stop", "توقف", "panic", "ساکت کردن"],
  }[state];

  return (
    <div class="window">
      <div class="header">
        <h1>پردازنده سیگنال</h1>

        <Indicator active={state === AppState.Started} failure={failure} />
      </div>

      <div class="content">
        <ErrorView failure={failure} setFailure={setFailure} />

        <p>
          در حال حاضر، این برنامه به صدای شما افکت Feedback Delay را اضافه می‌کند.
          برای شروع، ‌به یک میکروفون نیاز دارید.
        </p>

        <p><strong>توجه!</strong> مطمئن
          شوید مسیر مستقیمی برای صدا بین بلندگو و میکروفون شما برقرار نیست.
          در غیر این صورت ممکن است با صدای سوت بلندی مواجه شوید.
        </p>

        <div class="buttons">
          <button class={b1c} onClick={toggle} disabled={!!failure} >{b1l}</button>
          {b2l && !failure && <button class={b2c} onClick={panic} >{b2l}</button>}
        </div>

        <p>
          حلقه اصلی پردازش در <a href={code_href}>این قسمت</a> از کد است:
          <AudioHighlight class="language-typescript" />
        </p>
      </div>
    </div>
  );
}

const Indicator = ({ active, failure }: { active: Boolean, failure: string }) => {
  const [label, color] = [
    ["خطا", "red"], ["فعال", "green"], ["آماده", "blue"]
  ][failure ? 0 : active ? 1 : 2];

  return <span style={`background-color: var(--color-${color});`}>{label}</span>;
};

interface ErrorViewProps {
  failure: string;
  setFailure: StateUpdater<string>;
}

const ErrorView = ({ failure, setFailure }: ErrorViewProps) => {
  const roller: Ref<HTMLDivElement> = useRef();
  const [height, setHeight] = useState(0);
  const display = useRef(failure);

  display.current = failure || display.current;

  useLayoutEffect(() => {
    if (roller.current)
      setHeight(failure ? roller.current.offsetHeight : 0);
  }, [display.current, failure]);

  const inner = { __html: display.current };
  return (
    <div class="error" style={`max-height: ${height}px;`}>
      <div ref={roller} class="roller">
        <div>
          <div><b>خطا!</b> <span dangerouslySetInnerHTML={inner} /></div>
          <button class="dismiss" onClick={() => setFailure("")}>باشه</button>
        </div>
      </div>
    </div>
  );
};
