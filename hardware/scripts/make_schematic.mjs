// Subvocal Lidar: 1550 nm laser self-mixing sensor for eyewear. Builds the OpenSchematic design
// (hardware/subvocal-lidar.opensch.json). Every pin gets a short wire stub with a net label, so the netlist is defined
// by the tables below.
//   node hardware/scripts/make_schematic.mjs
//
// How it senses: a 1550 nm DFB laser shines on the skin over the jaw muscle (masseter). A little of the light scattered
// back re-enters the laser and modulates its power (self-mixing interferometry). The laser's own monitor photodiode
// sees one fringe per 0.775 um (half a wavelength) of skin movement; counting fringes with their direction gives skin
// displacement, the same kind of signal the Subvocal Radar measures, with ~500x finer steps.
//
// Blocks
//   Power : USB-C charging (MCP73831, 100 mA), LiPo cell with built-in protection, two TPS7A2033 3.3 V LDOs:
//           +3V3 always on (nRF52832), +3V3_A switched on only while the button is held (laser and analog).
//   MCU   : nRF52832 (Bluetooth LE keyboard + on-device phrase recognition), Nordic reference circuit (LDO mode),
//           32 MHz crystal, Pulse W3008 chip antenna, push-to-talk button, status LED, SWD test pads.
//   Laser : DAC7311 sets the laser current; TLV9061 + MMBT3904 + 47 R current sink (hardware limit 23 mA);
//           TLV9062: photodiode transimpedance amplifier (DC level) + AC gain x21 (fringes) into the nRF52832 ADC.
import { writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const OPENPCB = process.env.OPENPCB_DIR ?? join(homedir(), 'Documents', 'PCB Router 2022');   // openpcb checkout (github.com/ajisrawi/openpcb)
const SCH = `${OPENPCB}/packages/cli/dist/schematic/src/`;
const { newDesign, newPage } = await import(pathToFileURL(SCH + 'model.js'));
const { basicLibrary } = await import(pathToFileURL(SCH + 'library.js'));
const { partFor } = await import('./jlc_parts.mjs');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'subvocal-lidar.opensch.json');

// ---------------------------------------------------------------- symbols
const LIB = 'SubvocalLidar';
const parts = {};
const PIN_LEN = 100;

function boxPart(name, refPrefix, left, right, props, description) {
  const rows = Math.max(left.length, right.length);
  const longest = Math.max(4, ...[...left, ...right].map((p) => p[1].length));
  const w = Math.ceil((longest * 2 * 45 + 100) / 200) * 200;
  const h = rows * 100 + 100;
  const pins = [];
  left.forEach(([number, nm, type], i) => pins.push({ number, name: nm, type: type ?? 'passive', x: -w / 2 - PIN_LEN, y: i * 100, length: PIN_LEN, orient: 'left' }));
  right.forEach(([number, nm, type], i) => pins.push({ number, name: nm, type: type ?? 'passive', x: w / 2 + PIN_LEN, y: i * 100, length: PIN_LEN, orient: 'right' }));
  parts[name] = { name, refPrefix, props, description, units: [{ normal: { graphics: [{ kind: 'rect', x1: -w / 2, y1: -100, x2: w / 2, y2: h - 100 }], pins } }] };
}
function twoPin(name, refPrefix, props, description, names = ['1', '2']) {
  parts[name] = {
    name, refPrefix, props, description,
    units: [{ normal: { graphics: [{ kind: 'rect', x1: -100, y1: -40, x2: 100, y2: 40 }], pins: [
      { number: '1', name: names[0], type: 'passive', x: -200, y: 0, length: 100, orient: 'left' },
      { number: '2', name: names[1], type: 'passive', x: 200, y: 0, length: 100, orient: 'right' },
    ] } }],
  };
}
const P = 'power', I = 'input', O = 'output', B = 'bidirectional', NC = 'no_connect', PS = 'passive';

// nRF52832-QFAA, QFN-48 (pin map from KiCad MCU_Nordic / Nordic product specification)
const gp = (n, pin, extra = '') => [String(pin), `P0.${String(n).padStart(2, '0')}${extra}`, B];
boxPart('nRF52832_QFAA', 'U',
  [['13', 'VDD', P], ['36', 'VDD', P], ['48', 'VDD', P], ['1', 'DEC1', PS], ['32', 'DEC2', PS], ['33', 'DEC3', PS], ['46', 'DEC4', PS], ['47', 'DCC', PS],
   ['34', 'XC1', I], ['35', 'XC2', I], ['30', 'ANT', PS], ['31', 'VSS', P], ['45', 'VSS', P], ['49', 'VSS_EP', P], ['25', 'SWDCLK', I], ['26', 'SWDIO', B], ['44', 'NC', NC]],
  [gp(0, 2, '/XL1'), gp(1, 3, '/XL2'), gp(2, 4, '/AIN0'), gp(3, 5, '/AIN1'), gp(4, 6, '/AIN2'), gp(5, 7, '/AIN3'), gp(6, 8), gp(7, 9), gp(8, 10),
   gp(9, 11, '/NFC1'), gp(10, 12, '/NFC2'), gp(11, 14), gp(12, 15), gp(13, 16), gp(14, 17), gp(15, 18), gp(16, 19), gp(17, 20), gp(18, 21, '/SWO'),
   gp(19, 22), gp(20, 23), gp(21, 24, '/RESET'), gp(22, 27), gp(23, 28), gp(24, 29), gp(25, 37), gp(26, 38), gp(27, 39), gp(28, 40, '/AIN4'),
   gp(29, 41, '/AIN5'), gp(30, 42, '/AIN6'), gp(31, 43, '/AIN7')],
  { Value: 'nRF52832-QFAA', 'PCB Footprint': 'QFN-48-1EP_6x6mm_P0.4mm_EP4.6x4.6mm' }, 'Nordic nRF52832, Bluetooth LE SoC, Cortex-M4F 64 MHz');
boxPart('XTAL_4PIN', 'Y', [['1', 'X1', PS], ['3', 'X2', PS]], [['2', 'GND', PS], ['4', 'GND', PS]],
  { Value: '32MHz 8pF', 'PCB Footprint': 'Crystal_SMD_2016-4Pin_2.0x1.6mm' }, '32 MHz crystal, CL 8 pF');
boxPart('ANT_CHIP', 'AE', [['1', 'FEED', PS]], [['2', 'GND', PS]], { Value: 'W3008', 'PCB Footprint': 'Antenna_W3008' }, '2.4 GHz ceramic chip antenna');
boxPart('DAC7311', 'U', [['4', 'AVDD', P], ['5', 'GND', P], ['1', '~SYNC', I], ['2', 'SCLK', I], ['3', 'DIN', I]], [['6', 'VOUT', O]],
  { Value: 'DAC7311', 'PCB Footprint': 'SOT-363_SC-70-6' }, '12-bit DAC, SPI, reference = AVDD');
boxPart('OPAMP_DBV', 'U', [['5', 'V+', P], ['2', 'V-', P], ['3', 'IN+', I], ['4', 'IN-', I]], [['1', 'OUT', O]],
  { Value: 'TLV9061', 'PCB Footprint': 'SOT-23-5' }, 'Op-amp, rail-to-rail, 10 MHz (TLV9061 DBV pinout)');
boxPart('OPAMP2', 'U', [['8', 'V+', P], ['4', 'V-', P], ['3', '+A', I], ['2', '-A', I], ['5', '+B', I], ['6', '-B', I]], [['1', 'OUTA', O], ['7', 'OUTB', O]],
  { Value: 'TLV9062', 'PCB Footprint': 'VSSOP-8_3x3mm_P0.65mm' }, 'Dual op-amp, rail-to-rail, 10 MHz');
boxPart('NPN_BEC', 'Q', [['1', 'B', I]], [['3', 'C', PS], ['2', 'E', PS]], { Value: 'MMBT3904', 'PCB Footprint': 'SOT-23' }, 'NPN transistor (SOT-23: 1 B, 2 E, 3 C)');
boxPart('LDO_DBV', 'U', [['1', 'IN', P], ['3', 'EN', I], ['2', 'GND', P]], [['5', 'OUT', P], ['4', 'NC', NC]],
  { Value: 'TPS7A2033PDBVR', 'PCB Footprint': 'SOT-23-5' }, '3.3 V 300 mA low-noise LDO');
boxPart('MCP73831', 'U', [['4', 'VDD', P], ['5', 'PROG', PS], ['2', 'VSS', P]], [['3', 'VBAT', P], ['1', 'STAT', O]],
  { Value: 'MCP73831T-2ACI/OT', 'PCB Footprint': 'SOT-23-5' }, 'Single-cell Li-ion / LiPo charger, 4.20 V');
boxPart('USB_C_RECEPTACLE', 'J',
  [['A4', 'VBUS', P], ['A9', 'VBUS', P], ['B4', 'VBUS', P], ['B9', 'VBUS', P], ['A5', 'CC1', B], ['B5', 'CC2', B], ['A6', 'D+', NC], ['B6', 'D+', NC], ['A7', 'D-', NC], ['B7', 'D-', NC]],
  [['A1', 'GND', P], ['A12', 'GND', P], ['B1', 'GND', P], ['B12', 'GND', P], ['SH', 'SHIELD', PS], ['A8', 'SBU1', NC], ['B8', 'SBU2', NC]],
  { Value: 'TYPE-C-31-M-12', 'PCB Footprint': 'USB_C_Receptacle_HRO_TYPE-C-31-M-12' }, 'USB Type-C receptacle (charging only)');
boxPart('LASER_TO56', 'LD', [['2', 'LD_A', PS], ['1', 'LD_K', PS]], [['3', 'PD_K', PS], ['4', 'PD_A', PS]],
  { Value: '1550nm DFB + PD', 'PCB Footprint': 'LaserPads_4_TO56' }, '1550 nm DFB laser diode with monitor photodiode, TO-56 (hand-soldered, not from JLCPCB)');
twoPin('BATT', 'BT', { Value: 'LiPo 3.7V (protected)', 'PCB Footprint': 'BatteryPads_2' }, 'LiPo cell with built-in protection board', ['+', '-']);
twoPin('SW_PTT', 'SW', { Value: 'TS-1088-AR02016', 'PCB Footprint': 'SW_SPST_TS-1088-xR020' }, 'Side-push tactile switch (push to talk)');
twoPin('LED', 'D', { Value: 'red', 'PCB Footprint': 'LED_0603_1608Metric' }, 'LED (pin 1 = cathode)', ['K', 'A']);
twoPin('TP', 'TP', { Value: 'TP', 'PCB Footprint': 'TestPoint_Pad_D1.0mm' }, 'Test pad');
parts.TP.units[0].normal.pins = [parts.TP.units[0].normal.pins[0]];

// ---------------------------------------------------------------- design
const d = newDesign('subvocal-lidar');
d.libraries.push(basicLibrary());
d.libraries.push({ name: LIB, parts });
const sch = d.schematics[0];
const pageDefs = ['Power', 'MCU_BLE', 'Laser'];
sch.pages = pageDefs.map((n) => newPage(n, 'A2'));
const page = Object.fromEntries(pageDefs.map((n, i) => [n, sch.pages[i]]));
for (const [n, pg] of Object.entries(page)) pg.title = { Title: `Subvocal Lidar (1550 nm, eyewear) - ${n.replace('_', ' / ')}`, Revision: 'A', Company: 'SubvocalLidar', Date: '2026-11-16' };

let nextId = 1;
const id = () => nextId++;
const libOf = (part) => (parts[part] ? LIB : 'OpenSch');
const pinsOf = (part) => (parts[part] ?? basicLibrary().parts[part]).units[0].normal.pins;
function place(pg, part, ref, x, y, conn, props = {}) {
  const pi = { id: id(), lib: libOf(part), part, unit: 0, ref, x, y, rot: 0, props };
  pg.parts.push(pi);
  for (const pin of pinsOf(part)) {
    if (!(pin.number in conn)) throw new Error(`${ref}: pin ${pin.number} (${pin.name}) not assigned`);
    const net = conn[pin.number];
    const tip = { x: x + pin.x, y: y + pin.y };
    if (net === null) { pg.noConnects.push({ id: id(), at: tip }); continue; }
    const dx = pin.orient === 'left' ? -1 : pin.orient === 'right' ? 1 : 0;
    const dy = pin.orient === 'up' ? -1 : pin.orient === 'down' ? 1 : 0;
    const end = { x: tip.x + dx * 200, y: tip.y + dy * 200 };
    const w = { id: id(), pts: [tip, end] };
    pg.wires.push(w);
    pg.aliases.push({ id: id(), at: end, name: net, wire: w.id });
  }
  for (const k of Object.keys(conn)) if (!pinsOf(part).some((p) => p.number === k)) throw new Error(`${ref}: no pin ${k}`);
  return pi;
}
const R = (pg, ref, x, y, a, b, value) => place(pg, 'R', ref, x, y, { 1: a, 2: b }, { Value: value, 'PCB Footprint': 'R_0402_1005Metric' });
const C = (pg, ref, x, y, a, value, fp = 'C_0402_1005Metric', b = 'GND') => place(pg, 'C', ref, x, y, { 1: a, 2: b }, { Value: value, 'PCB Footprint': fp });
const ldo = (pg, ref, x, y, en, out) => place(pg, 'LDO_DBV', ref, x, y, { 1: 'VBAT', 3: en, 2: 'GND', 5: out, 4: null });

// ----- Power ----------------------------------------------------------------
{
  const pg = page.Power;
  place(pg, 'USB_C_RECEPTACLE', 'J1', 1500, 1200, {
    A4: 'VBUS', A9: 'VBUS', B4: 'VBUS', B9: 'VBUS', A5: 'USB_CC1', B5: 'USB_CC2', A6: null, B6: null, A7: null, B7: null,
    A1: 'GND', A12: 'GND', B1: 'GND', B12: 'GND', SH: 'GND', A8: null, B8: null,
  });
  R(pg, 'R1', 3300, 1000, 'USB_CC1', 'GND', '5.1k');
  R(pg, 'R2', 3300, 1300, 'USB_CC2', 'GND', '5.1k');
  // charger: 100 mA (R3 = 10k: I = 1000 V / 10 kOhm), red LED on while charging
  place(pg, 'MCP73831', 'U1', 5500, 1200, { 4: 'VBUS', 5: 'CHG_PROG', 2: 'GND', 3: 'VBAT', 1: 'CHG_STAT' });
  C(pg, 'C1', 5500, 1900, 'VBUS', '4.7uF', 'C_0603_1608Metric');
  C(pg, 'C2', 7200, 1200, 'VBAT', '4.7uF', 'C_0603_1608Metric');
  R(pg, 'R3', 5500, 2200, 'CHG_PROG', 'GND', '10k');
  R(pg, 'R4', 7200, 1600, 'VBUS', 'LED_CHG_A', '1k');
  place(pg, 'LED', 'D1', 7200, 1900, { 1: 'CHG_STAT', 2: 'LED_CHG_A' }, { Value: 'red' });
  // USB present (charging) -> GPIO, 2.5 V
  R(pg, 'R5', 3300, 2000, 'VBUS', 'USB_DET', '100k');
  R(pg, 'R6', 3300, 2300, 'USB_DET', 'GND', '100k');
  // the cell (with its own protection board, as sold for wearables)
  place(pg, 'BATT', 'BT1', 1500, 3200, { 1: 'VBAT', 2: 'GND' });
  // +3V3 always on (nRF52832, 6.5 uA quiescent), +3V3_A only while sensing
  ldo(pg, 'U2', 3500, 3200, 'VBAT', '+3V3');
  C(pg, 'C3', 3500, 3900, 'VBAT', '1uF');
  C(pg, 'C4', 5200, 3200, '+3V3', '1uF');
  ldo(pg, 'U3', 3500, 4600, 'ANA_EN', '+3V3_A');
  C(pg, 'C5', 3500, 5300, 'VBAT', '1uF');
  C(pg, 'C6', 5200, 4600, '+3V3_A', '4.7uF', 'C_0603_1608Metric');
  R(pg, 'R7', 5200, 5000, 'ANA_EN', 'GND', '100k');           // laser rail off unless the firmware turns it on
  // battery voltage: 1M / 1M into AIN2
  R(pg, 'R8', 7200, 3200, 'VBAT', 'VBAT_SENSE', '1M');
  R(pg, 'R9', 7200, 3500, 'VBAT_SENSE', 'GND', '1M');
  C(pg, 'C7', 7200, 3800, 'VBAT_SENSE', '100nF');
}

// ----- MCU / Bluetooth --------------------------------------------------------
{
  const pg = page.MCU_BLE;
  const nc = (...n) => Object.fromEntries(n.map((k) => [String(k), null]));
  place(pg, 'nRF52832_QFAA', 'U4', 3000, 1000, {
    13: '+3V3', 36: '+3V3', 48: '+3V3', 1: 'DEC1', 32: null, 33: 'DEC3', 46: 'DEC4', 47: null,
    34: 'XC1', 35: 'XC2', 30: 'RF_ANT', 31: 'GND', 45: 'GND', 49: 'GND', 25: 'SWDCLK', 26: 'SWDIO', 44: null,
    4: 'SMI_AC', 5: 'PD_DC', 6: 'VBAT_SENSE', 7: 'ANA_EN', 8: 'DAC_SCLK', 9: 'DAC_DIN', 10: 'DAC_SYNC',
    14: 'PTT_N', 15: 'LED_ST_K', 16: 'USB_DET', 24: 'NRF_RESET',
    ...nc(2, 3, 11, 12, 17, 18, 19, 20, 21, 22, 23, 27, 28, 29, 37, 38, 39, 40, 41, 42, 43),
  });
  // Nordic reference circuit, QFAA LDO configuration (nrf5-eagle-reference-design nRF52832_qfaa)
  C(pg, 'C10', 6200, 500, 'DEC1', '100nF');
  C(pg, 'C11', 6200, 800, 'DEC3', '100pF');
  C(pg, 'C12', 6200, 1100, 'DEC4', '1uF');
  C(pg, 'C13', 6200, 1400, '+3V3', '100nF');
  C(pg, 'C14', 6200, 1700, '+3V3', '100nF');
  C(pg, 'C15', 6200, 2000, '+3V3', '4.7uF', 'C_0603_1608Metric');
  place(pg, 'XTAL_4PIN', 'Y1', 6200, 2700, { 1: 'XC1', 3: 'XC2', 2: 'GND', 4: 'GND' });
  C(pg, 'C16', 7800, 2700, 'XC1', '12pF');
  C(pg, 'C17', 7800, 3000, 'XC2', '12pF');
  // RF: 0.8 pF shunt at the ANT pin, 3.9 nH series (Nordic), then a pi pad for antenna tuning (0R, shunts not fitted)
  C(pg, 'C18', 6200, 3600, 'RF_ANT', '0.8pF');
  place(pg, 'L', 'L1', 7800, 3600, { 1: 'RF_ANT', 2: 'RF_50' }, { Value: '3.9nH', 'PCB Footprint': 'L_0402_1005Metric' });
  R(pg, 'R10', 7800, 3900, 'RF_50', 'RF_FEED', '0R');
  place(pg, 'ANT_CHIP', 'AE1', 9400, 3900, { 1: 'RF_FEED', 2: 'GND' });
  // push to talk (internal pull-up; also wakes the nRF52832 from System OFF), status LED, SWD
  place(pg, 'SW_PTT', 'SW1', 6200, 4400, { 1: 'PTT_N', 2: 'GND' });
  R(pg, 'R11', 7800, 4400, '+3V3', 'LED_ST_A', '1k');
  place(pg, 'LED', 'D2', 7800, 4700, { 1: 'LED_ST_K', 2: 'LED_ST_A' }, { Value: 'yellow' });
  place(pg, 'TP', 'TP1', 9400, 500, { 1: 'SWDIO' });
  place(pg, 'TP', 'TP2', 9400, 800, { 1: 'SWDCLK' });
  place(pg, 'TP', 'TP3', 9400, 1100, { 1: 'NRF_RESET' });
  place(pg, 'TP', 'TP4', 9400, 1400, { 1: '+3V3' });
  place(pg, 'TP', 'TP5', 9400, 1700, { 1: 'GND' });
}

// ----- Laser front end --------------------------------------------------------
{
  const pg = page.Laser;
  // laser current set point: DAC (0-3.3 V) -> /3 and 1 ms RC -> 0-1.1 V across 47 R = 0-23 mA (hardware maximum)
  place(pg, 'DAC7311', 'U5', 1500, 1000, { 4: '+3V3_A', 5: 'GND', 1: 'DAC_SYNC', 2: 'DAC_SCLK', 3: 'DAC_DIN', 6: 'DAC_OUT' });
  C(pg, 'C20', 1500, 1700, '+3V3_A', '100nF');
  R(pg, 'R20', 3300, 1000, 'DAC_OUT', 'LD_SET', '20k');
  R(pg, 'R21', 3300, 1300, 'LD_SET', 'GND', '10k');
  C(pg, 'C21', 3300, 1600, 'LD_SET', '1uF');
  place(pg, 'OPAMP_DBV', 'U6', 5000, 1000, { 5: '+3V3_A', 2: 'GND', 3: 'LD_SET', 4: 'LD_FB', 1: 'LD_DRV' });
  C(pg, 'C22', 5000, 1700, '+3V3_A', '100nF');
  R(pg, 'R22', 6700, 1000, 'LD_DRV', 'LD_BASE', '1k');
  C(pg, 'C23', 6700, 1300, 'LD_DRV', '1nF', 'C_0402_1005Metric', 'LD_FB');          // loop compensation
  R(pg, 'R23', 6700, 1600, 'LD_SENSE', 'LD_FB', '1k');
  place(pg, 'NPN_BEC', 'Q1', 8300, 1000, { 1: 'LD_BASE', 3: 'LD_K', 2: 'LD_SENSE' });
  R(pg, 'R24', 8300, 1600, 'LD_SENSE', 'GND', '47R');
  // the laser: LD anode and PD cathode on +3V3_A (works for 4-pin and "common case" 3-pin TO-56 lasers)
  place(pg, 'LASER_TO56', 'LD1', 5000, 2700, { 2: '+3V3_A', 1: 'LD_K', 3: '+3V3_A', 4: 'PD_A' });
  // photodiode TIA: output = 3.0 V - I_pd x 2.2k  (I_pd 0.1-1 mA typ.), 10 pF -> 7 MHz
  R(pg, 'R25', 1500, 3600, '+3V3_A', 'VREF_HI', '10k');
  R(pg, 'R26', 1500, 3900, 'VREF_HI', 'GND', '100k');
  C(pg, 'C24', 1500, 4200, 'VREF_HI', '1uF');
  R(pg, 'R27', 1500, 4600, '+3V3_A', 'VMID', '100k');
  R(pg, 'R28', 1500, 4900, 'VMID', 'GND', '100k');
  C(pg, 'C25', 1500, 5200, 'VMID', '1uF');
  place(pg, 'OPAMP2', 'U7', 4500, 3800, { 8: '+3V3_A', 4: 'GND', 3: 'VREF_HI', 2: 'PD_A', 1: 'PD_DC', 5: 'AC_IN', 6: 'AC_FB', 7: 'AC_OUT' });
  C(pg, 'C26', 4500, 4700, '+3V3_A', '100nF');
  R(pg, 'R29', 6300, 3600, 'PD_A', 'PD_DC', '2.2k');
  C(pg, 'C27', 6300, 3900, 'PD_A', '10pF', 'C_0402_1005Metric', 'PD_DC');
  // AC gain stage: 160 Hz high-pass into a x21 non-inverting amplifier around 1.65 V, 80 kHz anti-alias filter
  C(pg, 'C28', 6300, 4300, 'PD_DC', '100nF', 'C_0402_1005Metric', 'AC_IN');
  R(pg, 'R30', 6300, 4600, 'AC_IN', 'VMID', '10k');
  R(pg, 'R31', 7900, 3600, 'AC_OUT', 'AC_FB', '20k');
  C(pg, 'C29', 7900, 3900, 'AC_OUT', '100pF', 'C_0402_1005Metric', 'AC_FB');
  R(pg, 'R32', 7900, 4200, 'AC_FB', 'VMID', '1k');
  R(pg, 'R33', 7900, 4600, 'AC_OUT', 'SMI_AC', '2k');
  C(pg, 'C30', 7900, 4900, 'SMI_AC', '1nF');
}

const missing = [];
for (const pg of sch.pages) for (const pi of pg.parts) {
  const lp = parts[pi.part] ?? basicLibrary().parts[pi.part];
  const value = pi.props.Value ?? lp.props.Value, fp = pi.props['PCB Footprint'] ?? lp.props['PCB Footprint'];
  if (pi.ref.startsWith('TP') || pi.ref === 'LD1' || pi.ref === 'BT1') continue;   // test pads, hand-soldered laser and cell
  const jp = partFor(value, fp);
  if (!jp) { missing.push(`${pi.ref} (${value}, ${fp})`); continue; }
  pi.props.LCSC = jp.lcsc; pi.props.MPN = jp.mpn;
}
if (missing.length) throw new Error('no LCSC part for: ' + missing.join(', '));
writeFileSync(OUT, JSON.stringify(d, null, 1));
console.log(JSON.stringify({ ok: true, file: OUT, parts: sch.pages.reduce((s, p) => s + p.parts.length, 0) }));
