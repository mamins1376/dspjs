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

import AudioHighlight from "highlight:160,172:./audio";

const audio = new Audio();

const enum AppState { Ready, Opened, Started }

const App = () => {
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
    <div class="frame">
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
            حلقه اصلی پردازش در این قسمت از کد است:
            <AudioHighlight class="language-typescript line-numbers" />
          </p>
        </div>
      </div>
    </div>
  );
};

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

export default App;
