import "./style.scss";

import Processor from "./processor";

import { h, Ref, render } from "preact";
import { useState, useRef, useCallback, useEffect, StateUpdater, useLayoutEffect } from "preact/hooks";
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
  const startDSP = useDSP(active, setActive, setFailure);

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
            <button class="start" onClick={startDSP}
              disabled={!!failure}>شروع</button>
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
    color = "#cf3349";
  } else if (active) {
    label = "فعال";
    color = "#32c252";
  } else {
    label = "آماده";
    color = "#0083e5";
  }

  return <span style={`background-color: ${color}`}>{label}</span>;
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

function useDSP(
  active: Boolean,
  setActive: StateUpdater<Boolean>,
  setFailure: StateUpdater<string>
) {
  const [context, makeContext] = useAudioContext(setFailure);
  const stretcher = useStretcher(context, setFailure);
  const [mic, openMic] = useMic(setFailure);

  useEffect(() => {
    if (!active && context && stretcher && mic) {
      context.createMediaStreamSource(mic).connect(stretcher);
      stretcher.connect(context.destination);
      setActive(true);
    }
  }, [active, context, stretcher, mic, setActive]);

  const startDSP = useCallback(() => {
    makeContext();
    openMic();
  }, [makeContext, openMic]);

  return openMic;
};

function useAudioContext(setFailure: StateUpdater<string>) {
  const ref = useRef(null);

  const makeContext = useCallback(() => {
    if (ref.current === null) {
      if (window.AudioContext)
        ref.current = new window.AudioContext();
      else {
        setFailure(unsupported);
        console.error("window.AudioContext is missing");
      }
    }
  }, [setFailure])

  return [ref.current, makeContext];
};

function useStretcher(
  context: AudioContext | null,
  setFailure: StateUpdater<string>,
): AudioWorkletNode | ScriptProcessorNode | null {
  let node = useRef(null);

  useEffect(() => {
    if (window.AudioWorkletNode) {
      if (!node.current && context) {
        context.audioWorklet.addModule("worklet.js")
          .then(_ => node.current = new AudioWorkletNode(context, "custom-worklet"))
          .catch(e => {
            setFailure(`نمیتوان پردازنده را اجرا کرد (علت: ${e.message})`);
            console.error("audioWorklet.addModule failed:", e);
          });
      }
    } else if (context.createScriptProcessor) {
      console.warn("AudioWorkletNode is missing, using ScriptProcessorNode");
      node.current = context.createScriptProcessor();
      let processors = [0, 0].map(_ => new Processor(context.sampleRate));
      node.current.addEventListener("audioprocess", (event: any) => {
        let { inputBuffer, outputBuffer } = event;
        for (let c = 0; c < outputBuffer.numberOfChannels; c++) {
          const x = inputBuffer.getChannelData(c);
          const y = outputBuffer.getChannelData(c);
          processors[c].process(x, y);
        }
      });
    } else {
      setFailure(unsupported);
      console.error("AudioWorkletNode and ScriptProcessorNode are missing");
    }
  }, [node, context, setFailure]);

  return node.current;
}

function useMic(setFailure: StateUpdater<string>) {
  const [stream, setStream] = useState(null);

  const openMic = useCallback(() => {
    if (stream === null) {
      if (navigator.mediaDevices?.getUserMedia) {
        navigator.mediaDevices.getUserMedia(track_criteria)
          .then(setStream)
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
    }
  }, [stream, setFailure]);

  return [stream, openMic];
};
