import "./style.scss";

import { h, render } from "preact";
import { useState, useRef, useCallback, useEffect, StateUpdater } from "preact/hooks";

const enum State { Ready, Active, Failed };

const old_browser = "مرورگر شما قدیمیست و نیاز به به‌روز رسانی دارد.";

const track_criteria = {
  audio: {
    autoGainControl: false,
    echoCancellation: false,
    noiseSuppression: false,
  }
};

const modes = {
  [State.Ready]: { label: "آماده", color: "#0083e5", },
  [State.Active]: { label: "فعال", color: "#32c252", },
  [State.Failed]: { label: "خطا", color: "#cf3349", },
};

let failure = "";

render(<App />, document.body);

function App() {
  const [state, setState] = useState(State.Ready);
  const startDSP = useDSP({ state, setState });

  return (
    <div class="frame">
      <div class="window">
        <div class="header">
          <h1>پردازنده سیگنال</h1>

          <Mode state={state} />
        </div>

        <div class="content">
          <ErrorView { ...{ state, setState } } />

          <p>
            با این برنامه می‌توانید صدای خود را به صورت زنده آهسته کنید. با این کار،
            صدای شما بم شده و کندتر پخش می‌شود.
          </p>

          <div style="text-align: left">
            <button class="start" onClick={startDSP}
              disabled={state !== State.Ready}>شروع</button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface StateProps {
  state: State;
  setState: StateUpdater<State>;
}

function Mode({ state }: Pick<StateProps, "state">) {
  let [mode, setMode] = useState(state);

  if (mode !== state && modes.hasOwnProperty(state)) {
    mode = state;
    setMode(state);
  }

  const { label, color } = modes[mode];
  return <span style={`background-color: ${color}`}>{label}</span>;
};

function ErrorView({ state, setState }: StateProps) {
  const classes = "error" + (state === State.Failed ? " show" : "");
  const onClick = () => setState(State.Ready);
  return (
    <div class={classes}>
      <div>
        <span><b>خطا!</b> {failure}</span>
        <button class="dismiss" onClick={onClick}>باشه</button>
      </div>
    </div>
  );
};

function useDSP({ state, setState }: StateProps) {
  const context = useAudioContext(setState);
  const [mic, openMic] = useMic({ state, setState });

  useEffect(() => {
    if (state === State.Ready && context && mic) {
      context.createMediaStreamSource(mic)
        .connect(context.destination);
      setState(State.Active);
    }
  }, [context, mic, state, setState]);

  return openMic;
};

function useAudioContext(setState: StateUpdater<State>) {
  const ref = useRef(null);
  if (ref.current === null) {
    if (window.AudioContext) {
      ref.current = new window.AudioContext();
    } else {
      setState(State.Failed);
      failure = old_browser;
    }
  }
  return ref.current;
};

function useMic({ state, setState }: StateProps) {
  const [stream, setStream] = useState(null);

  const openMic = useCallback(() => {
    if (stream === null) {
      if (navigator.mediaDevices) {
        navigator.mediaDevices
          .getUserMedia(track_criteria)
          .then(setStream)
          .catch(() => {
            setState(State.Failed);
            failure = "برای استفاده از این برنامه، به دسترسی صدا نیاز است.";
          });
      } else {
        setState(State.Failed);
        failure = old_browser;
      }
    }
  }, [stream, state, setState]);

  return [stream, openMic];
};
