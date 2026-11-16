// Subvocal Lidar, wired module: every JLCPCB-assembled part with its LCSC part number. Single source for the schematic properties,
// the JLCPCB BOM and the order notes. Looked up on jlcpcb.com parts search on 2026-11-16.
// basic = JLCPCB basic library (no setup fee); extended = about $3 setup fee per unique part.
// NOT from JLCPCB: the 1550 nm laser (LD1, hand-soldered, see docs/LASER.md).
export const PARTS = [
  { value: 'TCA9406', footprint: 'VSSOP-8_2.3x2mm_P0.5mm', lcsc: 'C840107', mpn: 'TI TCA9406DCUR (I2C level shifter)', lib: 'extended', stock: 9290 },
  { value: 'TPS7A2033PDBVR', footprint: 'SOT-23-5', lcsc: 'C2862740', mpn: 'TI TPS7A2033PDBVR', lib: 'extended', stock: 128160 },
  { value: 'AFC07-S06FCA-00', footprint: 'Jushuo_AFC07-S06FCA-00_1x6-1MP_P0.50_Horizontal', lcsc: 'C262553', mpn: 'JUSHUO AFC07-S06FCA-00 (6-pin 0.5 mm FPC, bottom contact)', lib: 'extended', stock: 20725 },
  { value: 'nRF52832-QFAA', footprint: 'QFN-48-1EP_6x6mm_P0.4mm_EP4.6x4.6mm', lcsc: 'C77540', mpn: 'Nordic nRF52832-QFAA-R', lib: 'extended', stock: 24390 },
  { value: 'DAC7311', footprint: 'SOT-363_SC-70-6', lcsc: 'C128601', mpn: 'TI DAC7311IDCKR (12-bit)', lib: 'extended', stock: 8079 },
  { value: 'TLV9061', footprint: 'SOT-23-5', lcsc: 'C398358', mpn: 'TI TLV9061IDBVR', lib: 'extended', stock: 244524 },
  { value: 'TLV9062', footprint: 'VSSOP-8_3x3mm_P0.65mm', lcsc: 'C398356', mpn: 'TI TLV9062IDGKR', lib: 'extended', stock: 50893 },
  { value: 'MMBT3904', footprint: 'SOT-23', lcsc: 'C20526', mpn: 'MMBT3904', lib: 'basic', stock: 4348893 },
  { value: '4.7uF', footprint: 'C_0603_1608Metric', lcsc: 'C19666', mpn: 'CL10A475KO8NNNC 16V X5R', lib: 'basic', stock: 3502435 },
  { value: '1uF', footprint: 'C_0402_1005Metric', lcsc: 'C52923', mpn: 'CL05A105KA5NQNC 25V X5R', lib: 'basic', stock: 9643593 },
  { value: '100nF', footprint: 'C_0402_1005Metric', lcsc: 'C1525', mpn: 'CL05B104KO5NNNC 16V X7R', lib: 'basic', stock: 37292195 },
  { value: '1nF', footprint: 'C_0402_1005Metric', lcsc: 'C1523', mpn: '0402B102K500NT X7R', lib: 'basic', stock: 3491819 },
  { value: '100pF', footprint: 'C_0402_1005Metric', lcsc: 'C1546', mpn: '0402CG101J500NT C0G', lib: 'basic', stock: 3241789 },
  { value: '10pF', footprint: 'C_0402_1005Metric', lcsc: 'C32949', mpn: 'CL05C100JB5NNNC C0G', lib: 'basic', stock: 1977549 },
  { value: '47R', footprint: 'R_0402_1005Metric', lcsc: 'C25118', mpn: '0402WGF470JTCE', lib: 'basic', stock: 1383646 },
  { value: '1k', footprint: 'R_0402_1005Metric', lcsc: 'C11702', mpn: '0402WGF1001TCE 1%', lib: 'basic', stock: 31020148 },
  { value: '2k', footprint: 'R_0402_1005Metric', lcsc: 'C4109', mpn: '0402WGF2001TCE 1%', lib: 'basic', stock: 9905603 },
  { value: '2.2k', footprint: 'R_0402_1005Metric', lcsc: 'C25879', mpn: '0402WGF2201TCE 1%', lib: 'basic', stock: 3003372 },
  { value: '10k', footprint: 'R_0402_1005Metric', lcsc: 'C25744', mpn: '0402WGF1002TCE 1%', lib: 'basic', stock: 20609005 },
  { value: '20k', footprint: 'R_0402_1005Metric', lcsc: 'C25765', mpn: '0402WGF2002TCE 1%', lib: 'basic', stock: 2830701 },
  { value: '100k', footprint: 'R_0402_1005Metric', lcsc: 'C25741', mpn: '0402WGF1003TCE 1%', lib: 'basic', stock: 10009917 },
];

export function partFor(value, footprint) {
  return PARTS.find((p) => p.value === value && p.footprint === footprint);
}

// JLCPCB placement rotation offsets (degrees, added to the layout rotation) for KiCad-style footprints.
// JLCPCB shows every part in its placement preview before you pay: confirm pin 1 there.
export const ROTATION_OFFSETS = [
  [/^SOT-23/, 180],
  [/^SOT-363/, 180],
  [/^QFN-/, 270],
  [/^VSSOP-8_3x3/, 270],
  [/^VSSOP-8_2.3x2/, 270],
];
