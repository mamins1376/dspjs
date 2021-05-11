import "./style.scss";

import App from "./App";

import "webrtc-adapter";

import { h, render } from "preact";

render(h(App, undefined), document.body);
