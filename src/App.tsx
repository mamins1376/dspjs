import Audio from "./audio";

import {
  useState,
  useRef,
  useMemo,
  useCallback,
  StateUpdater,
  useLayoutEffect,
} from "preact/hooks";

import { h, Ref } from "preact";

export default function App() {
  const [failure, setFailure] = useState("");
  const [active, setActive] = useState(false);
  const audio = useMemo(() => new Audio(), []);

  const toggle = useCallback(async () => {
    if (!audio.is_open) {
      try {
        await audio.open();
      } catch (error) {
        if (typeof error === "string") {
          setFailure(error);
        } else {
          setFailure(error.message)
          console.log(error);
        }
      }
    }

    if (audio.is_started)
      audio.stop()
    else
      audio.start()

    setActive(audio.is_started);
  }, [audio, setFailure, setActive]);

  return (
    <div class="frame">
      <div class="window">
        <div class="header">
          <h1>پردازنده سیگنال</h1>

          <Indicator active={active} failure={failure} />
        </div>

        <div class="content">
          <ErrorView failure={failure} setFailure={setFailure} />

          <p>
            با این برنامه می‌توانید صدای خود را به صورت زنده آهسته کنید. با این کار،
            صدای شما بم شده و کندتر پخش می‌شود.
          </p>

          <div style="text-align: left">
            <button
              class={ active ? "stop" : "start" }
              onClick={toggle}
              disabled={!!failure}
            >{ active ? "توقف" : "شروع" }</button>
          </div>
        </div>
      </div>
    </div>
  );
};

function Indicator({ active, failure }: { active: Boolean, failure: string }) {
  let label, color;
  if (failure) {
    label = "خطا";
    color = "red";
  } else if (active) {
    label = "فعال";
    color = "green";
  } else {
    label = "آماده";
    color = "blue";
  }

  color = `background-color: var(--color-${color});`
  return <span style={color}>{label}</span>;
};

interface ErrorViewProps {
  failure: string;
  setFailure: StateUpdater<string>;
}

function ErrorView({ failure, setFailure }: ErrorViewProps) {
  const roller: Ref<HTMLDivElement> = useRef();
  const [height, setHeight] = useState(0);
  const [display, setDisplay] = useState(failure);

  if (failure)
    setDisplay(failure);

  useLayoutEffect(() => {
    if (roller.current)
      setHeight(failure ? roller.current.offsetHeight : 0);
  }, [roller, failure, setHeight]);

  const inner = { __html: display || failure };
  return (
    <div class="error" style={`max-height: ${height}px`}>
      <div ref={roller} class="roller">
        <div>
          <div><b>خطا!</b> <span dangerouslySetInnerHTML={inner} /></div>
          <button class="dismiss" onClick={() => setFailure("")}>باشه</button>
        </div>
      </div>
    </div>
  );
};
