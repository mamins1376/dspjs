import { shimGetUserMedia as chrome } from "webrtc-adapter/src/js/chrome/getusermedia";
import { shimGetUserMedia as firefox } from "webrtc-adapter/src/js/firefox/getusermedia";
import { shimGetUserMedia as safari } from "webrtc-adapter/src/js/safari/safari_shim";
import { detectBrowser } from "webrtc-adapter/src/js/utils";

const map = { "chrome": chrome, "firefox": firefox, "safari": safari };
const browserDetails = detectBrowser(window);
map[browserDetails.browser](window, browserDetails);
