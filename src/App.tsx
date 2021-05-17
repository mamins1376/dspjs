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

const root = "https://github.com/mamins1376/dspjs/blob/default"
const process_link = root + "/src/audio.ts#L160-L172";

const enum AppState { Ready, Opened, Started }

const App = () => {
  const [failure, setFailure] = useState("");
  const [state, setState] = useState(AppState.Ready);
  const audio = useSingleton(() => new Audio());

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
            <Code />
          </p>

          <p>
            می‌توانید کد کامل پردازش سیگنال
            را <a target="__blank" href={process_link} >اینجا</a> ببینید.
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

const Code = () => {
  const div: Ref<HTMLDivElement> = useRef();
  const [height, setHeight] = useState(0);

  const iframe = useSingleton(() => {
    const src = new URL("https://emgithub.com/embed.js");
    const params = src.searchParams;
    params.append("target", encodeURI(process_link));
    params.append("style", "github");
    ["Border", "LineNumbers"].forEach(s => params.append(`show${s}`, "on"));

    const styles = Array.prototype.map.call(
      document.head.getElementsByTagName("style"),
      node => node.cloneNode(true)
    ) as Array<HTMLStyleElement>;

    const iframe = document.createElement("iframe");
    iframe.srcdoc = `<!DOCTYPE html><script src="${src.href}"></script>`;
    iframe.addEventListener("load", ({ target }) => {
      const doc = (target as HTMLIFrameElement).contentDocument!;
      styles.forEach(style => doc.body.appendChild(style));
      (new MutationObserver(() => setHeight(10 + doc.documentElement.scrollHeight)))
        .observe(doc.documentElement, { childList: true, subtree: true });
    });

    return iframe;
  });

  useEffect(() => {
    div.current?.appendChild(iframe);
    return () => div.current?.removeChild(iframe);
  }, [div.current]);

  useEffect(() => { iframe.style.height = height + "px"; }, [height]);

  return <div ref={div} class="code-container" style={`max-height: ${height}px;`} />;
};

type NonVoid<T> = Exclude<NonNullable<T>, void>;

function useSingleton<T>(init: () => NonVoid<T>): NonVoid<T> {
  const ref: Ref<NonVoid<T>> = useRef(null);
  return ref.current === null ? (ref.current = init()) : ref.current;
};

export default App;
