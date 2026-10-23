import assert from "node:assert/strict";
import { DEVICES, KIND_LABEL, indicatorOf, worldOf } from "./src/data.js";

assert.equal(DEVICES.length, 41);
assert.equal(new Set(DEVICES.map((d) => d.id)).size, 41);

const vert = DEVICES.find((d) => d.id === "VERT-01");
assert.equal(vert.name, "直式洗衣機 #8");
assert.equal(vert.x, 193);
assert.equal(vert.z, -101);
assert.equal(vert.type, "洗衣設備");
assert.equal(vert.kind, "vertical");
assert.deepEqual(vert.mapRect, [876, 363, 104, 66]);

const comp = DEVICES.find((d) => d.id === "COMP-01");
assert.equal(comp.y, 36);
assert.equal(comp.level, "架高二層");
assert.equal(worldOf(comp).y, 2.2);

const crane = DEVICES.find((d) => d.id === "CRANE-01");
assert.equal(crane.y, 76);
assert.equal(worldOf(crane).y, 4.35);

const statuses = new Set(["正常", "待保養", "維修中", "停用"]);
const maps = new Set(["normal", "due", "overdue", "issue", "stopped"]);
for (const device of DEVICES) {
  assert.ok(statuses.has(device.status), device.id);
  assert.ok(maps.has(device.mapState), device.id);
  assert.ok(KIND_LABEL[device.kind], device.kind);
  assert.equal(device.mapRect.length, 4);
  assert.ok(Number.isFinite(device.rotationY));
  const world = worldOf(device);
  assert.ok(Number.isFinite(world.x + world.y + world.z));
}

const keys = new Set(DEVICES.map(indicatorOf));
for (const key of ["ok", "due", "warn", "alarm", "stopped"]) assert.ok(keys.has(key), key);

const xs = DEVICES.map((d) => d.x);
const zs = DEVICES.map((d) => d.z);
const cx = DEVICES.map((d) => d.mapRect[0] + d.mapRect[2] / 2);
const cy = DEVICES.map((d) => d.mapRect[1] + d.mapRect[3] / 2);
function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return num / Math.sqrt(da * db);
}
console.log("devices", DEVICES.length);
console.log("corr x/mapX", pearson(xs, cx).toFixed(3), "z/mapY", pearson(zs, cy).toFixed(3));
console.log("world x", Math.min(...DEVICES.map((d) => worldOf(d).x)).toFixed(2), Math.max(...DEVICES.map((d) => worldOf(d).x)).toFixed(2));
console.log("world z", Math.min(...DEVICES.map((d) => worldOf(d).z)).toFixed(2), Math.max(...DEVICES.map((d) => worldOf(d).z)).toFixed(2));
console.log("ok");
