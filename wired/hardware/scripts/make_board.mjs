// Subvocal Lidar WIRED module PCB with openpcb (OpenSchematic -> OpenBoard -> OpenRoute).
//   node wired/hardware/scripts/make_board.mjs            build, place, route, DRC, fab outputs
//   node wired/hardware/scripts/make_board.mjs --no-route stop after placement (for inspection)
// Board 41 x 11 mm, 4 layers, 0.8 mm: fits inside a smart-glasses temple arm. OpenBoard coordinates (mm, y up):
//   x = 0  rear end: the 1550 nm laser sits in the corner cut-out and points down (-y) at the jaw muscle
//   x = 41 front end: 6-pin FPC connector, the cable leaves towards the glasses' main board
//   y = 0  bottom edge, facing the cheek
// All parts on the top side (JLCPCB Economic PCBA); the bottom side carries only the SWD test pads.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OPENPCB = process.env.OPENPCB_DIR ?? join(homedir(), 'Documents', 'PCB Router 2022');   // openpcb checkout (github.com/ajisrawi/openpcb)
const CLI = `${OPENPCB}/packages/cli/dist/cli/src/openpcb.js`;
const KICAD = process.env.KICAD_FOOTPRINTS ?? 'C:/Program Files/KiCad/10.0/share/kicad/footprints';
const HW = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'subvocal-lidar-wired';
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
export const W = 41, H = 11;
export const CUT = { x1: 7.2, y1: 6.0 };      // laser corner cut-out (TO-56 can, 5.6 mm)

// ---------------------------------------------------------------- 1. new board + footprints
if (existsSync(BOARD)) rmSync(BOARD);
op('new', BOARD, '--name', NAME, '--layers', 4, '--width', W, '--height', H);
const kicad = [
  'Package_DFN_QFN.pretty/QFN-48-1EP_6x6mm_P0.4mm_EP4.6x4.6mm',
  'Package_TO_SOT_SMD.pretty/SOT-363_SC-70-6', 'Package_TO_SOT_SMD.pretty/SOT-23-5', 'Package_TO_SOT_SMD.pretty/SOT-23',
  'Package_SO.pretty/VSSOP-8_3x3mm_P0.65mm', 'Package_SO.pretty/VSSOP-8_2.3x2mm_P0.5mm',
  'Connector_FFC-FPC.pretty/Jushuo_AFC07-S06FCA-00_1x6-1MP_P0.50_Horizontal',
  'TestPoint.pretty/TestPoint_Pad_D1.0mm',
  'Capacitor_SMD.pretty/C_0402_1005Metric', 'Capacitor_SMD.pretty/C_0603_1608Metric', 'Resistor_SMD.pretty/R_0402_1005Metric',
].map((f) => `${KICAD}/${f}.kicad_mod`);
log('import footprints', op('import-footprint', BOARD, ...kicad, join(HW, 'footprints', 'LaserPads_4_TO56.kicad_mod')).names?.length);
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
  p.footprints.Jushuo_AFC07_S06FCA_00_1x6_1MP_P0_50_Horizontal && (p.footprints.Jushuo_AFC07_S06FCA_00_1x6_1MP_P0_50_Horizontal.body = { w: 8.6, h: 4.4 });
  for (const [k, fp] of Object.entries(p.footprints)) if (k.startsWith('Jushuo')) fp.body = { w: 8.6, h: 4.6 };   // connector housing + lid
  p.outline = [{ x: 0, y: CUT.y1 }, { x: CUT.x1, y: CUT.y1 }, { x: CUT.x1, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
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
  LD1: [CUT.x1 / 2, CUT.y1, 0, 'front'],           // laser pads along the top of the cut-out
  J1: [W - 3.65, H / 2, 90, 'front'],              // FPC connector, cable entry at the front end
  U4: [25.0, H / 2, 0, 'front'],                   // nRF52832
  TP1: [29.0, 1.6, 0, 'back'], TP2: [31.0, 1.6, 0, 'back'], TP3: [33.0, 1.6, 0, 'back'], TP4: [29.0, 9.4, 0, 'back'], TP5: [31.0, 9.4, 0, 'back'],
};
const HOST = new Set(['U2', 'U3', 'U8', 'C1', 'C3', 'C4']);
const MCU = new Set(['C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C2', 'C5', 'R1', 'R2']);
{
  const p = load();
  for (const c of p.components) {
    const f = fixed[c.ref];
    if (f) { [c.x, c.y, c.rot, c.side] = f; c.locked = true; continue; }
    c.side = 'front'; c.rot = 0;
    [c.x, c.y] = HOST.has(c.ref) ? [32.5, 5] : MCU.has(c.ref) ? [26.5, 5] : [15, 5];
  }
  const free = p.components.filter((c) => !c.locked).map((c) => c.ref);
  p.rooms = [
    { name: 'HOST', rect: { x1: 28.6, y1: 0.9, x2: W - 6.1, y2: H - 0.9 }, refs: free.filter((x) => HOST.has(x)) },
    { name: 'MCU', rect: { x1: 20.0, y1: 0.9, x2: 29.5, y2: H - 0.9 }, refs: free.filter((x) => MCU.has(x)) },
    { name: 'LASER', rect: { x1: CUT.x1 + 0.9, y1: 0.9, x2: 21.5, y2: H - 0.9 }, refs: free.filter((x) => !HOST.has(x) && !MCU.has(x)) },
  ];
  save(p);
}
log('autoplace', op('place', BOARD, '--mode', 'anneal', '--spacing', 0.3, '--grid', 0.05, '--iters', 1200, '--seed', 37,
  '--decap', 6, '--weight', 'PD_A=10,LD_K=6,LD_SENSE=6,LD_FB=6,AC_.*=6,DEC.*=8,I2C_.*=3,HOST_.*=3,SMI_AC=4', '--ignore-nets', 'GND').summary ?? '');
// legalise: a part whose body (pads + 0.1 mm) overlaps another or leaves the outline moves to the nearest free spot
// (0.1 mm spiral search); the annealer leaves a few such overlaps on a board this dense
{
  const p = load();
  const M = 0.03;                  // bodies already include 0.1 mm around the pads: this keeps >= 0.25 mm between pads
  const box = (c, x = c.x, y = c.y) => { const fp = p.footprints[c.footprint]; const q = (c.rot % 180 === 0); const w = (q ? fp.body.w : fp.body.h) / 2 + M, h = (q ? fp.body.h : fp.body.w) / 2 + M; return { x1: x - w, x2: x + w, y1: y - h, y2: y + h }; };
  const hit = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  const inBoard = (b) => b.x1 >= 0.25 - M && b.x2 <= W - 0.25 + M && b.y1 >= 0.25 - M && b.y2 <= H - 0.25 + M && !(b.x1 < CUT.x1 && b.y1 < CUT.y1);
  const front = p.components.filter((c) => c.side === 'front');
  let moved = 0, stuck = 0;
  for (const c of front) {
    if (c.locked) continue;
    const others = front.filter((o) => o !== c);
    const ok = (x, y) => { const b = box(c, x, y); return inBoard(b) && !others.some((o) => hit(b, box(o))); };
    if (ok(c.x, c.y)) continue;
    let done = false;
    for (let r = 0.1; r <= 4 && !done; r += 0.1) {
      for (let a = 0; a < 360 && !done; a += 15) {
        const x = +(c.x + r * Math.cos((a * Math.PI) / 180)).toFixed(2), y = +(c.y + r * Math.sin((a * Math.PI) / 180)).toFixed(2);
        if (ok(x, y)) { c.x = x; c.y = y; done = true; moved++; }
      }
    }
    if (!done) stuck++;
  }
  save(p);
  log('legalise', { moved, stuck });
}
op('zone', BOARD, 'GND', 'In1.Cu', 0, 0, W, H);
op('class', BOARD, 'POWER', '--nets', 'VIN,+3V3,+3V3_A', '--width', 0.25);
op('class', BOARD, 'SENSE', '--nets', 'PD_A,AC_IN,AC_FB', '--width', 0.15, '--priority', 5);
op('render', BOARD, join(HW, 'board_placed.svg'), '--width', 1200);
{
  const p = load();
  const inside = (x, y) => { let c = false; const o = p.outline; for (let i = 0, j = o.length - 1; i < o.length; j = i++) if ((o[i].y > y) !== (o[j].y > y) && x < ((o[j].x - o[i].x) * (y - o[i].y)) / (o[j].y - o[i].y) + o[i].x) c = !c; return c; };
  const out = [];
  for (const c of p.components) {
    if (['J1', 'LD1'].includes(c.ref)) continue;
    const fp = p.footprints[c.footprint]; const sw = (c.rot % 180 === 0) ? fp.body.w : fp.body.h, sh = (c.rot % 180 === 0) ? fp.body.h : fp.body.w;
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]]) if (!inside(c.x + dx * sw / 2, c.y + dy * sh / 2)) { out.push(c.ref); break; }
  }
  if (out.length) throw new Error('parts outside the board outline after placement: ' + out.join(', '));
}
const padClash = (op('drc', BOARD).items ?? []).filter((m) => m.kind === 'clearance' && /^pad .* to pad /.test(m.message));
if (padClash.length) { padClash.forEach((m) => log('  pad clash', [m.layer, m.at, m.message])); if (!args.has('--force')) throw new Error(`${padClash.length} pad clashes after placement`); }
if (args.has('--no-route')) { log('stopped after placement'); process.exit(0); }

// ---------------------------------------------------------------- 4. route + check
const route = op('route', BOARD, '--script', join(HW, 'route.do'), '--log', join(HW, 'route.log'));
log('route (OpenRoute lattice)', { unrouted: route.unrouted, conflicts: route.conflicts, vias: route.vias });
const fin = op('route', BOARD, '--gridless', '--finish', '--passes', 60, '--time-limit', 600);
log('route (gridless finish)', { unrouted: fin.unrouted, conflicts: fin.conflicts });
const keep = op('route', BOARD, '--keep', '--passes', 40);
log('route (lattice, keep copper)', { unrouted: keep.unrouted, conflicts: keep.conflicts });
const rats = op('ratsnest', BOARD);
log('open connections before pours', rats.unrouted);
if (rats.unrouted) log('  open', rats.connections.map((c) => c.net));
op('smooth', BOARD);
op('zone', BOARD, 'GND', 'F.Cu', 0, 0, W, H);
op('zone', BOARD, 'GND', 'B.Cu', 0, 0, W, H);
op('stitch', BOARD, '--net', 'GND', '--pitch', 1.6, '--in-zone');
for (const r of ['U4-', 'U7-', 'U8-', 'J1-']) op('waive', BOARD, '--kind', 'mask-sliver', '--match', r);   // fine-pitch parts: ganged mask openings
for (const r of ['J1', 'LD1']) op('waive', BOARD, '--kind', 'silk-off-board', '--match', `${r} silkscreen`);
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
op('render', BOARD, join(HW, 'board_routed.svg'), '--width', 1200, '--no-rats');

// ---------------------------------------------------------------- 5. fabrication outputs
mkdirSync(OUT, { recursive: true });
log('gerber', op('gerber', BOARD, join(OUT, 'gerber'), '--zip', '--name', NAME).files?.length);
log('assembly', op('assembly', BOARD, join(OUT, 'assembly'), '--name', NAME).files);
op('export-step', BOARD, join(OUT, `${NAME}.step`), '--thickness', 0.8);
op('sch-pdf', SCH, join(HW, `${NAME}-schematic.pdf`));
op('sch-bom', SCH, join(OUT, `${NAME}-bom-full.csv`));
log('done');
