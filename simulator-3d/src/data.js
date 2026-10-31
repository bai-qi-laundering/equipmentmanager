// Sample console data shaped like the live equipment manager.
// Names, ids, type, kind, x, y, z, level and rotation match the layout
// embedded in the production page. Pixel rects match its map hotspots.
// Operational fields (status, inspections, dates, notes) are simulator-only.

const RAW = [
  ["不鏽鋼工作台 1", "周邊設備", "worktable", -185, 0, -226, "一樓", "DESK-01", 1.57079632679],
  ["打包機 1", "周邊設備", "packer", -150, 0, -226, "一樓", "PACK-01", 0],
  ["不鏽鋼工作台 2", "周邊設備", "worktable", -108, 0, -226, "一樓", "DESK-02", 0],
  ["打包機 2", "周邊設備", "packer", -185, 0, -187, "一樓", "PACK-02", 0],
  ["60K", "折疊設備", "folding", -185, 0, -130, "一樓", "60K-01", 1.57079632679],
  ["80K", "折疊設備", "folding", -185, 0, -64, "一樓", "80K-01", 1.57079632679],
  ["30K", "折疊設備", "folding", -185, 0, -10, "一樓", "30K-01", 0],
  ["廁所 1", "周邊設備", "toilet", -185, 0, 45, "一樓", "WC-01", 0],
  ["廁所 2", "周邊設備", "toilet", -185, 0, 92, "一樓", "WC-02", 0],
  ["乾洗機", "洗衣設備", "dryclean", -153, 0, 123, "一樓", "DRYCLEAN-01", 0],
  ["SMF", "燙床設備", "lineSMF", -195, 0, 151, "一樓", "SMF-01", 0],
  ["ICC", "燙床設備", "lineICC", -132, 0, 151, "一樓", "ICC-01", 0],
  ["襯衫機", "整燙設備", "shirt", -75, 0, -167, "一樓", "SHIRT-01", 0],
  ["壓板機", "整燙設備", "longPress", -75, 0, -104, "一樓", "EQ-1", 0],
  ["整燙區", "整燙設備", "pressZone", -75, 0, -39, "一樓", "FINISH-01", 0],
  ["冷風區", "周邊設備", "fan", -75, 0, 76, "一樓", "FAN-01", 0],
  ["空壓機", "周邊設備", "compressor", -75, 36, 76, "架高二層", "COMP-01", 0],
  ["洗衣機", "洗衣設備", "washer", 0, 0, -228, "一樓", "WASH-EXTRA-01", 0],
  ["N5", "燙床設備", "lineN5", 0, 0, -125, "一樓", "N5-01", 1.57079632679],
  ["IRT", "燙床設備", "lineIRT", 0, 0, -53, "一樓", "IRT-01", 1.57079632679],
  ["35kg", "洗衣設備", "washer", 167, 0, -216, "一樓", "W35-01", 0],
  ["50kg", "洗衣設備", "washer", 196, 0, -216, "一樓", "W50-01", 0],
  ["兩層辦公室", "周邊設備", "office", 182, 0, -159, "一樓", "OFFICE-01", 0],
  ["直式洗衣機 #8", "洗衣設備", "vertical", 193, 0, -101, "一樓", "VERT-01", 0],
  ["直式洗衣機 #7", "洗衣設備", "vertical", 193, 0, -60, "一樓", "VERT-02", 0],
  ["直式洗衣機 #6", "洗衣設備", "vertical", 193, 0, -19, "一樓", "VERT-03", 0],
  ["直式洗衣機 #5", "洗衣設備", "vertical", 193, 0, 22, "一樓", "VERT-05", 0],
  ["直式洗衣機 #3", "洗衣設備", "vertical", 193, 0, 63, "一樓", "VERT-06", 0],
  ["直式洗衣機 #2", "洗衣設備", "vertical", 193, 0, 104, "一樓", "VERT-07", 0],
  ["直式洗衣機 #1", "洗衣設備", "vertical", 193, 0, 145, "一樓", "VERT-08", 0],
  ["烘乾機 #3", "烘乾設備", "dryer", 62, 0, 101, "一樓", "DRY-03", 0],
  ["烘乾機 #5", "烘乾設備", "dryer", 91, 0, 101, "一樓", "DRY-02", 0],
  ["烘乾機 #6", "烘乾設備", "dryer", 120, 0, 101, "一樓", "DRY-01", 0],
  ["烘乾機（L 型 後段）", "烘乾設備", "dryer", 62, 0, 144, "一樓", "DRY-04", 0],
  ["烘乾機（L 型 末段）", "烘乾設備", "dryer", 62, 0, 187, "一樓", "DRY-05", 0],
  ["猛沙過濾設備", "周邊設備", "manganese", 91, 36, 92, "架高二層", "MANG-01", 0],
  ["天車 #1", "周邊設備", "crane", 59, 76, 73, "架高二層", "CRANE-01", 0],
  ["天車 #2", "周邊設備", "crane", 123, 76, 73, "架高二層", "CRANE-02", 0],
  ["鍋爐", "周邊設備", "boiler", 132, 0, 164, "一樓", "BOILER-01", 0],
  ["水設備", "周邊設備", "water", -124, 0, 281, "一樓", "WATER-01", 0],
  ["水塔", "周邊設備", "tank", -70, 0, 281, "一樓", "TANK-01", 0],
];

const REGIONS = {
  "DESK-01": [56, 65, 60, 100],
  "PACK-01": [132, 39, 65, 105],
  "DESK-02": [190, 72, 113, 80],
  "PACK-02": [70, 173, 68, 90],
  "60K-01": [71, 256, 67, 117],
  "80K-01": [69, 374, 75, 72],
  "30K-01": [41, 439, 132, 64],
  "WC-01": [44, 512, 112, 100],
  "WC-02": [9, 610, 147, 107],
  "DRYCLEAN-01": [55, 735, 94, 119],
  "SMF-01": [19, 870, 169, 91],
  "ICC-01": [196, 870, 159, 91],
  "SHIRT-01": [291, 144, 120, 123],
  "EQ-1": [287, 267, 127, 115],
  "FINISH-01": [274, 386, 148, 87],
  "FAN-01": [289, 617, 99, 83],
  "COMP-01": [256, 529, 157, 90],
  "WASH-EXTRA-01": [446, 30, 80, 100],
  "N5-01": [456, 162, 91, 224],
  "IRT-01": [456, 387, 94, 291],
  "W35-01": [809, 129, 66, 76],
  "W50-01": [877, 129, 66, 76],
  "OFFICE-01": [789, 206, 198, 160],
  "VERT-01": [876, 363, 104, 66],
  "VERT-02": [876, 429, 104, 62],
  "VERT-03": [876, 491, 104, 61],
  "VERT-05": [876, 552, 104, 62],
  "VERT-06": [876, 614, 104, 58],
  "VERT-07": [876, 672, 104, 62],
  "VERT-08": [876, 734, 104, 63],
  "DRY-03": [598, 633, 79, 101],
  "DRY-02": [677, 633, 77, 101],
  "DRY-01": [754, 633, 74, 105],
  "DRY-04": [598, 736, 83, 104],
  "DRY-05": [598, 841, 87, 107],
  "MANG-01": [616, 542, 184, 90],
  "CRANE-01": [597, 491, 54, 90],
  "CRANE-02": [777, 491, 57, 90],
  "BOILER-01": [748, 756, 141, 120],
  "WATER-01": [244, 1018, 195, 194],
  "TANK-01": [442, 1014, 98, 196],
};

// Visual scale only. Stored x/z are divided so the hall fits a camera;
// stored y is a layer index (0 floor, 36 mezzanine, 76 crane rail).
export const LAYOUT = {
  xz: 0.05,
  elevations: { 0: 0, 36: 2.2, 76: 4.35 },
};

export const KIND_LABEL = {
  worktable: "工作台",
  packer: "打包機",
  folding: "折疊機",
  toilet: "廁所",
  dryclean: "乾洗機",
  lineSMF: "SMF 燙床",
  lineICC: "ICC 燙床",
  shirt: "襯衫機",
  longPress: "壓板機",
  pressZone: "整燙區",
  fan: "冷風區",
  compressor: "空壓機",
  washer: "洗衣機",
  lineN5: "N5 燙床",
  lineIRT: "IRT 燙床",
  office: "辦公室",
  vertical: "直式洗衣機",
  dryer: "烘乾機",
  manganese: "猛沙過濾",
  crane: "天車",
  boiler: "鍋爐",
  water: "水設備",
  tank: "水塔",
};

export const INDICATOR = {
  ok: { color: "#2ee6a6", label: "正常" },
  due: { color: "#3ec6ff", label: "今日查檢" },
  warn: { color: "#ffc14a", label: "待關注" },
  alarm: { color: "#ff4b4d", label: "異常" },
  stopped: { color: "#8b98a6", label: "停用" },
};

export const MAP_STATE_LABEL = {
  normal: "查檢正常",
  due: "今日查檢",
  overdue: "查檢逾期",
  issue: "異常",
  stopped: "停用",
};

export const TYPE_ORDER = ["全部設備", "洗衣設備", "折疊設備", "烘乾設備", "燙床設備", "整燙設備", "周邊設備"];

const SAMPLE = {
  "VERT-02": {
    status: "維修中",
    mapState: "issue",
    vendor: "示範協力廠",
    notes: "示範：運轉中出現異音，已停機待換皮帶。此狀態不是正式系統資料。",
    cleaningLastDate: "2026-09-28",
    repairs: [{ date: "2026-10-20", issue: "運轉異音", parts: "皮帶（待料）", notes: "示範紀錄，未寫入正式系統", cost: null, vendor: "示範協力廠", recorder: "監控台示範" }],
  },
  "BOILER-01": {
    status: "維修中",
    mapState: "issue",
    vendor: "示範協力廠",
    notes: "示範：鍋爐壓力異常，維修處理中。",
    repairs: [{ date: "2026-10-18", issue: "壓力異常", parts: "", notes: "示範紀錄，未寫入正式系統", cost: null, vendor: "示範協力廠", recorder: "監控台示範" }],
  },
  "DRY-02": {
    status: "待保養",
    mapState: "normal",
    notes: "示範：保養週期將至。猛沙過濾設備架在此區上方。",
    maintenanceLastDate: "2026-04-20",
    maintenanceCycleDays: 180,
  },
  "N5-01": {
    status: "待保養",
    mapState: "normal",
    notes: "示範：燙床待排保養。",
    maintenanceLastDate: "2026-04-12",
    maintenanceCycleDays: 180,
  },
  "W50-01": {
    status: "待保養",
    mapState: "normal",
    notes: "示範：50kg 洗衣機待保養。",
    maintenanceLastDate: "2026-04-28",
    maintenanceCycleDays: 180,
  },
  "EQ-1": {
    status: "待保養",
    mapState: "overdue",
    notes: "示範：壓板機查檢已逾期。",
  },
  "80K-01": {
    status: "正常",
    mapState: "overdue",
    notes: "示範：折疊機查檢逾期。",
  },
  "COMP-01": {
    status: "正常",
    mapState: "overdue",
    notes: "示範：空壓機位於冷風區上方，查檢逾期。",
  },
  "DRY-03": {
    status: "正常",
    mapState: "due",
    notes: "示範：今日應查檢。",
  },
  "SMF-01": {
    status: "正常",
    mapState: "due",
    notes: "示範：今日應查檢。",
  },
  "DRY-05": {
    status: "停用",
    mapState: "stopped",
    notes: "示範：此機台停用。",
  },
};

function pad(n) {
  return String(n).padStart(2, "0");
}

function seed(id) {
  let h = 0;
  for (const c of id) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return h;
}

function baseline(id) {
  const h = seed(id);
  return {
    status: "正常",
    mapState: "normal",
    vendor: "",
    notes: "",
    repairs: [],
    commissionedDate: `${2014 + (h % 10)}-${pad(1 + (h % 12))}-${pad(1 + (h % 27))}`,
    cleaningLastDate: `2026-10-${pad(2 + (h % 18))}`,
    cleaningCycleDays: [7, 14, 30, 30][h % 4],
    maintenanceLastDate: `2026-${pad(1 + (h % 5))}-${pad(1 + (h % 27))}`,
    maintenanceCycleDays: [90, 180, 180, 365][h % 4],
  };
}

export function worldOf(device) {
  const y = device.y >= 70 ? LAYOUT.elevations[76] : device.y >= 30 ? LAYOUT.elevations[36] : LAYOUT.elevations[0];
  return { x: device.x * LAYOUT.xz, y, z: device.z * LAYOUT.xz };
}

export function indicatorOf(device) {
  if (device.status === "停用" || device.mapState === "stopped") return "stopped";
  if (device.status === "維修中" || device.mapState === "issue") return "alarm";
  if (device.mapState === "overdue" || device.status === "待保養") return "warn";
  if (device.mapState === "due") return "due";
  return "ok";
}

export function addIsoDays(iso, days) {
  if (!iso || !days) return "";
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return "";
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

export function taipeiToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const DEVICES = RAW.map((row) => {
  const [name, type, kind, x, y, z, level, id, rotationY] = row;
  return {
    id,
    name,
    type,
    kind,
    x,
    y,
    z,
    level,
    rotationY,
    mapRect: REGIONS[id],
    ...baseline(id),
    ...SAMPLE[id],
  };
});
