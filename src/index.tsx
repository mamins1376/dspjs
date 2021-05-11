import "./style.scss";

import Processor from "./processor";

import { h, Ref, render } from "preact";
import {
  useState,
  useRef,
  useCallback,
  StateUpdater,
  useLayoutEffect,
} from "preact/hooks";
import "webrtc-adapter";

const unsupported = "متأسفانه مروگر شما پشتیبانی نمی‌شود. لطفاً از " +
  "فایرفاکس ۷۶ یا جدیدتر، و یا کروم ۶۵ یا جدیدتر استفاده کنید.";

const track_criteria = {
  audio: {
    autoGainControl: false,
    echoCancellation: false,
    noiseSuppression: false,
  }
};

render(<App />, document.body);

function App() {
  const [active, setActive] = useState(false);
  const [failure, setFailure] = useState("");
  const context = useAudioContext(active, setFailure);
  const stretcher = useStretcher(context, setFailure);
  const mic = useMic(active, setFailure);
  const [connected, setConnected] = useState(false);

  if (active && context && stretcher && mic && !connected) {
    context.createMediaStreamSource(mic).connect(stretcher);
    stretcher.connect(context.destination);
    setConnected(true);
  } else if (!active && connected) {
    stretcher.disconnect(context.destination);
    context.close()
      .then(() => setConnected(false));
  }

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
              onClick={() => setActive(!active)}
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

function useAudioContext(
  active: boolean,
  setFailure: StateUpdater<string>,
): AudioContext | null {
  const [me, setMe] = useState(null);

  if (!me && active) {
    if (window.AudioContext) {
      setMe(new window.AudioContext());
    } else {
      setFailure(unsupported);
      console.error("window.AudioContext is missing");
    }
  } else if (me && !active) {
    setMe(null);
  }

  return me;
};

function useStretcher(
  context: AudioContext | null,
  setFailure: StateUpdater<string>,
): AudioWorkletNode | ScriptProcessorNode | null {
  let [me, setMe] = useState(null);

  if (!me && context) {
    if (window.AudioWorkletNode) {
      context.audioWorklet.addModule("worklet.js")
        .then(_ => setMe(new AudioWorkletNode(context, "custom-worklet")))
        .catch(e => {
          setFailure(`نمیتوان پردازنده را اجرا کرد (علت: ${e.message})`);
          console.error("audioWorklet.addModule failed:", e);
        });
    } else if (context.createScriptProcessor) {
      console.warn("AudioWorkletNode is missing, using ScriptProcessorNode");
      const node = context.createScriptProcessor();
      let processors = [0, 0].map(_ => new Processor(context.sampleRate));
      node.addEventListener("audioprocess", (event: any) => {
        let { inputBuffer, outputBuffer } = event;
        for (let c = 0; c < outputBuffer.numberOfChannels; c++) {
          const x = inputBuffer.getChannelData(c);
          const y = outputBuffer.getChannelData(c);
          processors[c].process(x, y);
        }
      });
      setMe(node);
    } else {
      setFailure(unsupported);
      console.error("AudioWorkletNode and ScriptProcessorNode are missing");
    }
  } else if (me && !context) {
    setMe(null);
  }

  return me;
}

function useMic(
  active: boolean,
  setFailure: StateUpdater<string>,
): MediaStream | null {
  const [me, setMe] = useState(null);

  if (!me && active) {
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia(track_criteria)
        .then(setMe)
        .catch((e: any) => {
          setFailure("برای استفاده از این برنامه، به دسترسی صدا نیاز است.")
          console.error("getUserMedia failed:", e);
        });
    } else {
      if (isSecureContext === false) {
        setFailure("مطمئن شوید این صفحه با پروتکل امن "
          + "(http<strong>s</strong>) بارگزاری شده است.");
        console.error("insecure context");
      } else {
        setFailure(unsupported);
        console.error("navigator.mediaDevices is missing");
      }
    }
  } else if (me && !active) {
    setMe(null);
  }

  return me;
};
