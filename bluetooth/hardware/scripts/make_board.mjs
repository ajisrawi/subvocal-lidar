// Subvocal Lidar PCB with openpcb (OpenSchematic -> OpenBoard -> OpenRoute).
//   node bluetooth/hardware/scripts/make_board.mjs            build, place, route, DRC, fab outputs
//   node bluetooth/hardware/scripts/make_board.mjs --no-route stop after placement (for inspection)
// Board 12 x 62 mm, 4 layers, 0.8 mm. It sits upright in a pod on the right temple of a pair of glasses, like Google
// Glass. OpenBoard coordinates (mm, y up), seen from the outside of the pod:
//   x = 0  rear end (towards the ear): USB-C for charging
//   x = 62 front end (towards the hinge): nRF52832 and its chip antenna at the top-front corner
//   y = 0  bottom edge, facing the cheek: the laser notch, where the 1550 nm laser points down at the jaw muscle
//   y = 12 top edge: push-to-talk button
// All parts on the top side (JLCPCB Economic PCBA); the bottom side is flat for the battery and has only test pads.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OPENPCB = process.env.OPENPCB_DIR ?? join(homedir(), 'Documents', 'PCB Router 2022');   // openpcb checkout (github.com/ajisrawi/openpcb)
const CLI = `${OPENPCB}/packages/cli/dist/cli/src/openpcb.js`;
const KICAD = process.env.KICAD_FOOTPRINTS ?? 'C:/Program Files/KiCad/10.0/share/kicad/footprints';
const HW = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'subvocal-lidar';
const BOARD = join(HW, `${NAME}.openboard.json`);
const SCH = join(HW, `${NAME}.opensch.json`);
const OUT = join(HW, 'fab');
const args = new Set(process.argv.slice(2));

function op(...a) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...a.map(String)], { encoding: 'utf8', maxBuffer: 1 << 28 });
    const last = out.trim().split('\n').pop();
    try { return JSON.parse(last); } catch { return { raw: out }; }
  } catch (e) {
    if (e.status === 2) { try { return JSON.parse(e.stdout.trim().split('\n').pop()); } catch { /* fall through */ } }
    throw new Error(`openpcb ${a.join(' ')} failed:\n${e.stdout ?? ''}${e.stderr ?? ''}`);
  }
}
const load = () => JSON.parse(readFileSync(BOARD, 'utf8'));
const save = (p) => writeFileSync(BOARD, JSON.stringify(p, null, 1));
const log = (msg, o) => console.log(msg, o === undefined ? '' : JSON.stringify(o));

// ---------------------------------------------------------------- geometry
export const W = 62, H = 12;
export const NOTCH = { x0: 16.8, x1: 24.0, y1: 6.4 };           // laser notch in the bottom edge (TO-56 can is 5.6 mm)
const LASER_X = (NOTCH.x0 + NOTCH.x1) / 2;
const ANT = { x: 60.3, y: 8.2 };                                 // W3008 chip antenna, vertical, at the top-front corner
const ANT_KEEP = { x1: 58.1, y1: 3.0, x2: W, y2: 8.75 };         // copper-free area around it (all layers)

// ---------------------------------------------------------------- 1. new board + footprints
if (existsSync(BOARD)) rmSync(BOARD);
op('new', BOARD, '--name', NAME, '--layers', 4, '--width', W, '--height', H);
const kicad = [
  'Package_DFN_QFN.pretty/QFN-48-1EP_6x6mm_P0.4mm_EP4.6x4.6mm',
  'Crystal.pretty/Crystal_SMD_2016-4Pin_2.0x1.6mm',
  'Package_TO_SOT_SMD.pretty/SOT-363_SC-70-6', 'Package_TO_SOT_SMD.pretty/SOT-23-5', 'Package_TO_SOT_SMD.pretty/SOT-23',
  'Package_SO.pretty/VSSOP-8_3x3mm_P0.65mm',
  'Connector_USB.pretty/USB_C_Receptacle_HRO_TYPE-C-31-M-12',
  'Button_Switch_SMD.pretty/SW_SPST_TS-1088-xR020',
  'TestPoint.pretty/TestPoint_Pad_D1.0mm',
  'Capacitor_SMD.pretty/C_0402_1005Metric', 'Capacitor_SMD.pretty/C_0603_1608Metric',
  'Resistor_SMD.pretty/R_0402_1005Metric', 'Inductor_SMD.pretty/L_0402_1005Metric',
  'LED_SMD.pretty/LED_0603_1608Metric',
].map((f) => `${KICAD}/${f}.kicad_mod`);
const own = ['LaserPads_4_TO56', 'Antenna_W3008', 'BatteryPads_2'].map((n) => join(HW, 'footprints', `${n}.kicad_mod`));
log('import footprints', op('import-footprint', BOARD, ...kicad, ...own).names?.length);
{
  const p = load();
  for (const fp of Object.values(p.footprints)) {
    const before = fp.pads.length;
    for (const q of fp.pads) if (q.th && q.drill !== undefined && q.drill >= Math.min(q.w, q.h) - 1e-6) { q.id = 'MH'; q.npth = true; }
    const inside = (a, b) => a !== b && Math.abs(a.x - b.x) + a.w / 2 <= b.w / 2 + 1e-6 && Math.abs(a.y - b.y) + a.h / 2 <= b.h / 2 + 1e-6;
    fp.pads = fp.pads.filter((a) => a.th || !fp.pads.some((b) => !b.th && b.w * b.h > a.w * a.h && inside(a, b)));
    fp.pads = fp.pads.filter((a) => a.id !== '');
    if (fp.pads.length !== before) log(`  ${fp.name}: removed ${before - fp.pads.length} paste-only pads`);
    let w = 0, h = 0;
    for (const q of fp.pads) { w = Math.max(w, 2 * (Math.abs(q.x) + q.w / 2) + 0.2); h = Math.max(h, 2 * (Math.abs(q.y) + q.h / 2) + 0.2); }
    fp.body = { w: Math.max(fp.body?.w ?? 0, w), h: Math.max(fp.body?.h ?? 0, h) };
  }
  p.footprints.LaserPads_4_TO56.body = { w: 6.4, h: 2.6 };
  // outline with the laser notch
  p.outline = [{ x: 0, y: 0 }, { x: NOTCH.x0, y: 0 }, { x: NOTCH.x0, y: NOTCH.y1 }, { x: NOTCH.x1, y: NOTCH.y1 }, { x: NOTCH.x1, y: 0 },
    { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  p.layers.find((l) => l.name === 'In1.Cu').type = 'power';
  save(p);
}
op('rules', BOARD, '--width', 0.127, '--clearance', 0.1, '--via', 0.45, '--drill', 0.2,
  '--edgeClearance', 0.25, '--minTrackWidth', 0.09, '--minAnnularRing', 0.1, '--holeToCopper', 0.2, '--holeToHole', 0.25,
  '--silkToCopper', 0.1, '--viaLength', 0.8, '--silkWidth', 0.12, '--maskExpansion', 0.05, '--minMaskSliver', 0.08);

// ---------------------------------------------------------------- 2. schematic -> board
const eco = op('sch-to-board', SCH, BOARD);
log('sch-to-board', { added: eco.added?.length, placeholders: eco.placeholders, missingPins: eco.missingPins });
if (eco.placeholders?.length || eco.missingPins?.length) throw new Error('footprint mismatch between schematic and board');
{ const d = JSON.parse(readFileSync(SCH, 'utf8')); if (d.boardLink) { d.boardLink.project = `${NAME}.openboard.json`; delete d.boardLink.lastSync; writeFileSync(SCH, JSON.stringify(d, null, 1)); } }

// ---------------------------------------------------------------- 3. placement
const fixed = {
  J1: [3.05, H / 2, 270, 'front'],                 // USB-C, opening at the rear edge (shell 0.6 mm past it)
  LD1: [LASER_X, NOTCH.y1, 0, 'front'],            // laser pads along the top of the notch
  SW1: [33.0, H - 1.55, 0, 'front'],               // push-to-talk, side-push actuator over the top edge
  U4: [48.0, 6.0, 0, 'front'],                     // nRF52832: RF and crystal pins face the front
  Y1: [52.75, 9.75, 0, 'front'],
  C18: [52.3, 5.3, 90, 'front'], L1: [53.6, 5.8, 0, 'front'], R10: [55.2, 5.8, 0, 'front'],   // ANT shunt, 3.9 nH, tuning 0R
  AE1: [ANT.x, ANT.y, 90, 'front'],                // feed (pad 1) at the bottom end, ground (pad 2) at the top end
  BT1: [LASER_X, H - 1.55, 0, 'front'],            // battery wires come over the top edge from the cell behind the board
  // SWD test pads on the bottom (bare copper, for a pogo-pin clip)
  TP1: [31.0, 3.0, 0, 'back'], TP2: [33.0, 3.0, 0, 'back'], TP3: [35.0, 3.0, 0, 'back'], TP4: [37.0, 3.0, 0, 'back'], TP5: [39.0, 3.0, 0, 'back'],
};
const POWER = new Set(['U1', 'U2', 'U3', 'D1', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);
const MCU = new Set(['C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'D2', 'R11']);
{
  const p = load();
  for (const c of p.components) {
    const f = fixed[c.ref];
    if (f) { [c.x, c.y, c.rot, c.side] = f; c.locked = true; continue; }
    c.side = 'front'; c.rot = 0;
    [c.x, c.y] = POWER.has(c.ref) ? [12, 6] : MCU.has(c.ref) ? [48, 6] : [32, 7];
  }
  const free = p.components.filter((c) => !c.locked).map((c) => c.ref);
  p.rooms = [
    // rooms stay clear of the laser notch (x 10.9-18.1, y < 6.4)
    { name: 'POWER', rect: { x1: 8.0, y1: 0.3, x2: NOTCH.x0 - 0.3, y2: H - 0.3 }, refs: free.filter((x) => POWER.has(x)) },
    { name: 'MCU', rect: { x1: 41.0, y1: 0.3, x2: 58.0, y2: H - 0.3 }, refs: free.filter((x) => MCU.has(x)) },
    { name: 'LASER', rect: { x1: NOTCH.x1 + 0.3, y1: 0.3, x2: 45.0, y2: H - 0.3 }, refs: free.filter((x) => !POWER.has(x) && !MCU.has(x)) },
  ];
  save(p);
}
log('autoplace', op('place', BOARD, '--mode', 'anneal', '--spacing', 0.2, '--grid', 0.05, '--iters', 600, '--seed', 3,
  '--decap', 6, '--weight', 'PD_A=10,LD_K=6,LD_SENSE=6,LD_FB=6,AC_.*=6,DEC.*=8,XC.*=8,RF_.*=8,SMI_AC=4', '--ignore-nets', 'GND').summary ?? '');

// keep-out: no copper near the chip antenna except its own pads
{
  const p = load();
  let id = p.nextId;
  for (const layer of ['In1.Cu', 'In2.Cu', 'B.Cu']) p.keepouts.push({ id: id++, layer, kind: 'keepout', rect: { ...ANT_KEEP } });
  // no vias or pour next to the USB-C mounting holes (NPTH: 0.2 mm hole-to-copper)
  const { padToBoard } = await import(pathToFileURL(`${OPENPCB}/packages/cli/dist/editor/src/model.js`));
  const j1 = p.components.find((c) => c.ref === 'J1');
  for (const q of p.footprints[j1.footprint].pads.filter((q) => q.id === 'MH')) {
    const a = padToBoard(j1, q), r = q.drill / 2 + 0.45;
    for (const layer of ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']) p.keepouts.push({ id: id++, layer, kind: 'keepout', rect: { x1: a.x - r, y1: a.y - r, x2: a.x + r, y2: a.y + r } });
  }
  p.nextId = id;
  save(p);
}
// ground planes stop at the antenna area, except a strip above it for the antenna's ground end
const gndZones = (layer) => { op('zone', BOARD, 'GND', layer, 0, 0, ANT_KEEP.x1, H); op('zone', BOARD, 'GND', layer, ANT_KEEP.x1, ANT_KEEP.y2, W, H); };
gndZones('In1.Cu');
op('class', BOARD, 'POWER', '--nets', 'VBUS,VBAT,+3V3,+3V3_A', '--width', 0.25);
op('class', BOARD, 'RF', '--nets', 'RF_ANT,RF_50,RF_FEED', '--width', 0.2, '--priority', 6);
op('class', BOARD, 'SENSE', '--nets', 'PD_A,AC_IN,AC_FB', '--width', 0.15, '--priority', 5);
op('render', BOARD, join(HW, 'board_placed.svg'), '--width', 1400);
{
  const p = load();
  const inside = (x, y) => { let c = false; const o = p.outline; for (let i = 0, j = o.length - 1; i < o.length; j = i++) if ((o[i].y > y) !== (o[j].y > y) && x < ((o[j].x - o[i].x) * (y - o[i].y)) / (o[j].y - o[i].y) + o[i].x) c = !c; return c; };
  const out = [], inAnt = [];
  for (const c of p.components) {
    if (['J1', 'SW1', 'LD1', 'AE1'].includes(c.ref)) continue;
    const fp = p.footprints[c.footprint]; const sw = (c.rot % 180 === 0) ? fp.body.w : fp.body.h, sh = (c.rot % 180 === 0) ? fp.body.h : fp.body.w;
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]]) if (!inside(c.x + dx * sw / 2, c.y + dy * sh / 2)) { out.push(c.ref); break; }
    if (c.x + sw / 2 > ANT_KEEP.x1 && c.y + sh / 2 > ANT_KEEP.y1 && c.y - sh / 2 < ANT_KEEP.y2) inAnt.push(c.ref);
  }
  if (out.length) throw new Error('parts outside the board outline after placement: ' + out.join(', '));
  if (inAnt.length) throw new Error('parts in the antenna keep-out: ' + inAnt.join(', '));
}
const padClash = (op('drc', BOARD).items ?? []).filter((m) => m.kind === 'clearance' && /^pad .* to pad /.test(m.message));
if (padClash.length) { padClash.forEach((m) => log('  pad clash', [m.layer, m.at, m.message])); if (!args.has('--force')) throw new Error(`${padClash.length} pad clashes after placement`); }
if (args.has('--no-route')) { log('stopped after placement'); process.exit(0); }

// ---------------------------------------------------------------- 4. route + check
const route = op('route', BOARD, '--script', join(HW, 'route.do'), '--log', join(HW, 'route.log'));
log('route (OpenRoute lattice)', { unrouted: route.unrouted, conflicts: route.conflicts, vias: route.vias });
const fin = op('route', BOARD, '--gridless', '--finish', '--passes', 30, '--time-limit', 400);
log('route (gridless finish)', { unrouted: fin.unrouted, conflicts: fin.conflicts });
const keep = op('route', BOARD, '--keep', '--passes', 20);
log('route (lattice, keep copper)', { unrouted: keep.unrouted, conflicts: keep.conflicts });
if (op('ratsnest', BOARD).connections?.some((c) => c.net === 'RF_FEED')) {
  // RF feed left open by the router: 0R pad 2 -> antenna pad 1, one straight 0.2 mm trace on the top layer
  const { padToBoard } = await import(pathToFileURL(`${OPENPCB}/packages/cli/dist/editor/src/model.js`));
  const p = load();
  const at = (ref, id) => { const c = p.components.find((q) => q.ref === ref); return padToBoard(c, p.footprints[c.footprint].pads.find((q) => q.id === id)); };
  const a1 = at('R10', '2'), a2 = at('AE1', '1');
  op('trace', BOARD, 'RF_FEED', 'F.Cu', 0.2, a1.x, a1.y, a1.x + 1.2, a1.y, a2.x, a2.y);
}
const rats = op('ratsnest', BOARD);
log('open connections before pours', rats.unrouted);
if (rats.unrouted) log('  open', rats.connections.map((c) => c.net));
op('smooth', BOARD);
gndZones('F.Cu');
gndZones('B.Cu');
op('stitch', BOARD, '--net', 'GND', '--pitch', 1.6, '--in-zone');
op('waive', BOARD, '--kind', 'mask-sliver', '--match', 'J1-');
op('waive', BOARD, '--kind', 'mask-sliver', '--match', 'U4-');
op('waive', BOARD, '--kind', 'mask-sliver', '--match', 'U7-');   // 0.65 mm-pitch VSSOP: ganged mask opening
for (const r of ['J1', 'SW1', 'LD1', 'BT1']) op('waive', BOARD, '--kind', 'silk-off-board', '--match', `${r} silkscreen`);
const drc = op('drc', BOARD);
writeFileSync(join(HW, 'drc.json'), JSON.stringify(drc, null, 1));
log('drc', { violations: drc.violations ?? drc.count, summary: drc.summary });
let pour = op('pourcheck', BOARD);
log('pourcheck (real pour fills)', { opens: pour.opens, nets: pour.nets?.map((n) => [n.net, n.pads]) });
if (pour.opens) {
  const { padToBoard } = await import(pathToFileURL(`${OPENPCB}/packages/cli/dist/editor/src/model.js`));
  for (const grp of pour.nets) for (const pin of grp.pads) {
    const p0 = load(); const [ref, padId] = pin.split(/-(?=[^-]+$)/);
    const c = p0.components.find((q) => q.ref === ref); const pad = p0.footprints[c.footprint].pads.find((q) => q.id === padId);
    const at = padToBoard(c, pad); const layer = c.side === 'back' ? 'B.Cu' : 'F.Cu';
    let ok = false;
    for (const rr of [0.5, 0.65, 0.8, 1.0, 1.2, 1.5]) {
      for (let k = 0; k < 8 && !ok; k++) {
        const x = +(at.x + rr * Math.cos((k * Math.PI) / 4)).toFixed(3), y = +(at.y + rr * Math.sin((k * Math.PI) / 4)).toFixed(3);
        const before = readFileSync(BOARD, 'utf8');
        op('via', BOARD, grp.net, x, y); op('trace', BOARD, grp.net, layer, 0.2, at.x, at.y, x, y);
        if ((op('drc', BOARD).violations ?? 1) === 0) ok = true; else writeFileSync(BOARD, before);
      }
      if (ok) break;
    }
    log(`  ${pin}: ${ok ? 'added a plane via' : 'no clean spot for a via'}`);
  }
  pour = op('pourcheck', BOARD);
  log('pourcheck after plane vias', { opens: pour.opens });
}
op('render', BOARD, join(HW, 'board_routed.svg'), '--width', 1400, '--no-rats');

// ---------------------------------------------------------------- 5. fabrication outputs
mkdirSync(OUT, { recursive: true });
log('gerber', op('gerber', BOARD, join(OUT, 'gerber'), '--zip', '--name', NAME).files?.length);
log('assembly', op('assembly', BOARD, join(OUT, 'assembly'), '--name', NAME).files);
op('export-step', BOARD, join(OUT, `${NAME}.step`), '--thickness', 0.8);
op('sch-pdf', SCH, join(HW, `${NAME}-schematic.pdf`));
op('sch-bom', SCH, join(OUT, `${NAME}-bom-full.csv`));
log('done');
