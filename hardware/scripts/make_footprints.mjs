// Custom KiCad footprints for Subvocal Lidar (written to hardware/footprints/):
//   LaserPads_4_TO56   4 hand-solder pads for a 1550 nm TO-56 laser at the edge of the board's laser notch
//   Antenna_W3008      Pulse W3008 2.4 GHz chip antenna (1206), pad 1 feed, pad 2 ground (datasheet: either end may feed)
//   BatteryPads_2      2 solder pads for the LiPo cell's wires
//   node hardware/scripts/make_footprints.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'footprints');
mkdirSync(OUT, { recursive: true });
const f = (v) => (+v.toFixed(4)).toString();

function footprint(name, descr, pads, silk, refY) {
  const L = [`(footprint "${name}" (version 20240108) (generator "subvocal-lidar") (layer "F.Cu")`,
    `  (descr "${descr}")`, '  (attr smd)',
    `  (fp_text reference "REF**" (at 0 ${f(refY)}) (layer "F.SilkS") (effects (font (size 0.6 0.6) (thickness 0.1))))`,
    `  (fp_text value "${name}" (at 0 ${f(-refY)}) (layer "F.Fab") (effects (font (size 0.6 0.6) (thickness 0.1))))`];
  for (const [x1, y1, x2, y2] of silk) L.push(`  (fp_line (start ${f(x1)} ${f(y1)}) (end ${f(x2)} ${f(y2)}) (stroke (width 0.12) (type solid)) (layer "F.SilkS"))`);
  for (const p of pads) L.push(`  (pad "${p.n}" smd roundrect (at ${f(p.x)} ${f(p.y)}) (size ${f(p.w)} ${f(p.h)}) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.2))`);
  L.push(')', '');
  writeFileSync(join(OUT, `${name}.kicad_mod`), L.join('\n'));
}

// Laser: origin at the notch edge (KiCad y down: pads above the edge). Leads of the TO-56 can come up out of the notch,
// are trimmed to ~2.5 mm and soldered flat. Order: 1 LD cathode, 2 LD anode, 3 PD cathode, 4 PD anode.
// 2 and 3 are both +3V3_A, so a 3-pin "common case" laser (LD anode = PD cathode = case) uses pads 1, 2/3 and 4.
const P = 1.5;
footprint('LaserPads_4_TO56', '1550 nm TO-56 laser diode with monitor photodiode, hand-soldered leads at a board-edge notch',
  [1, 2, 3, 4].map((n, i) => ({ n: String(n), x: (i - 1.5) * P, y: -1.45, w: 0.9, h: 2.3 })),
  [[-3.1, -0.15, 3.1, -0.15]], -3.2);

// W3008: 3.2 x 1.6 mm body; 1206-style land, pads 1.0 x 1.8 mm at +-1.4 mm
footprint('Antenna_W3008', 'Pulse W3008 2.4 GHz ceramic chip antenna, 1206. Keep 4 x 4.25 mm free of copper on all layers around it',
  [{ n: '1', x: -1.4, y: 0, w: 1.0, h: 1.8 }, { n: '2', x: 1.4, y: 0, w: 1.0, h: 1.8 }],
  [[-1.9, -1.1, 1.9, -1.1], [-1.9, 1.1, 1.9, 1.1]], -1.9);

// Battery: two 1.8 x 2.4 mm pads, 3.6 mm apart (1 = +, 2 = -)
footprint('BatteryPads_2', 'LiPo cell wire pads, 1 = BAT+, 2 = BAT-',
  [{ n: '1', x: -1.8, y: 0, w: 1.8, h: 2.4 }, { n: '2', x: 1.8, y: 0, w: 1.8, h: 2.4 }],
  [[-2.9, -1.6, -2.9, 1.6]], -2.2);

console.log(JSON.stringify({ ok: true, out: OUT }));
