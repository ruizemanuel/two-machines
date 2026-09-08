import { target } from "vgpu";
import { init } from "vgpu/node";
import { createScene } from "./coin/scene";
import { INITIAL } from "./coin/state";
import { encodePng } from "./png";

const [w, h, spin, melt, mx, my] = process.argv.slice(2, 8).map(Number);
const serial = process.argv[8];

try {
  // Same contract as the tests: golden images and the shipped card must come
  // out of the same renderer.
  const gpu = await init({ adapter: "software" });
  const out = target(gpu, { size: [w, h], format: "rgba8unorm" });
  const scene = createScene(gpu, w, h);

  // time is 0 on purpose: the card has to be the frame on screen, grain included.
  scene.setSerial(serial);
  scene.render(out, { ...INITIAL, spin, melt, mouse: [mx, my], time: 0, flash: 0, press: 0 });

  process.stdout.write(Buffer.from(encodePng(await out.read(), w, h)));
  gpu.dispose();   // stops Dawn polling so the process exits on its own
} catch (e: any) {
  process.stderr.write(JSON.stringify({ code: e?.code, message: e?.message }));
  process.exit(3);
}
