// Subvocal Lidar: every JLCPCB-assembled part with its LCSC part number. Single source for the schematic properties,
// the JLCPCB BOM and the order notes. Looked up on jlcpcb.com parts search on 2026-11-16.
// basic = JLCPCB basic library (no setup fee); extended = about $3 setup fee per unique part.
// NOT from JLCPCB: the 1550 nm laser (LD1, hand-soldered, see docs/LASER.md) and the LiPo cell.
export const PARTS = [
  { value: 'nRF52832-QFAA', footprint: 'QFN-48-1EP_6x6mm_P0.4mm_EP4.6x4.6mm', lcsc: 'C77540', mpn: 'Nordic nRF52832-QFAA-R', lib: 'extended', stock: 24390 },
  { value: '32MHz 8pF', footprint: 'Crystal_SMD_2016-4Pin_2.0x1.6mm', lcsc: 'C718072', mpn: 'X201632MKB4SI (8 pF, 10 ppm)', lib: 'extended', stock: 84859 },
  { value: 'W3008', footprint: 'Antenna_W3008', lcsc: 'C581402', mpn: 'Pulse W3008 2.4 GHz chip antenna', lib: 'extended', stock: 2166 },
  { value: '3.9nH', footprint: 'L_0402_1005Metric', lcsc: 'C77109', mpn: 'Murata LQG15HS3N9S02D', lib: 'extended', stock: 23069 },
  { value: 'DAC7311', footprint: 'SOT-363_SC-70-6', lcsc: 'C128601', mpn: 'TI DAC7311IDCKR (12-bit)', lib: 'extended', stock: 8079 },
  { value: 'TLV9061', footprint: 'SOT-23-5', lcsc: 'C398358', mpn: 'TI TLV9061IDBVR', lib: 'extended', stock: 244524 },
  { value: 'TLV9062', footprint: 'VSSOP-8_3x3mm_P0.65mm', lcsc: 'C398356', mpn: 'TI TLV9062IDGKR', lib: 'extended', stock: 50893 },
  { value: 'MMBT3904', footprint: 'SOT-23', lcsc: 'C20526', mpn: 'MMBT3904', lib: 'basic', stock: 4348893 },
  { value: 'TPS7A2033PDBVR', footprint: 'SOT-23-5', lcsc: 'C2862740', mpn: 'TI TPS7A2033PDBVR', lib: 'extended', stock: 128160 },
  { value: 'MCP73831T-2ACI/OT', footprint: 'SOT-23-5', lcsc: 'C424093', mpn: 'Microchip MCP73831T-2ACI/OT', lib: 'extended', stock: 8595 },
  { value: 'TYPE-C-31-M-12', footprint: 'USB_C_Receptacle_HRO_TYPE-C-31-M-12', lcsc: 'C165948', mpn: 'HRO TYPE-C-31-M-12', lib: 'extended', stock: 173947 },
  { value: 'TS-1088-AR02016', footprint: 'SW_SPST_TS-1088-xR020', lcsc: 'C720477', mpn: 'XUNPU TS-1088-AR02016 (side push)', lib: 'basic', stock: 560021 },
  { value: 'red', footprint: 'LED_0603_1608Metric', lcsc: 'C2286', mpn: 'KT-0603R', lib: 'basic', stock: 6980726 },
  { value: 'yellow', footprint: 'LED_0603_1608Metric', lcsc: 'C2287', mpn: 'KT-0603Y', lib: 'extended', stock: 57739 },
  { value: '4.7uF', footprint: 'C_0603_1608Metric', lcsc: 'C19666', mpn: 'CL10A475KO8NNNC 16V X5R', lib: 'basic', stock: 3502435 },
  { value: '1uF', footprint: 'C_0402_1005Metric', lcsc: 'C52923', mpn: 'CL05A105KA5NQNC 25V X5R', lib: 'basic', stock: 9643593 },
  { value: '100nF', footprint: 'C_0402_1005Metric', lcsc: 'C1525', mpn: 'CL05B104KO5NNNC 16V X7R', lib: 'basic', stock: 37292195 },
  { value: '1nF', footprint: 'C_0402_1005Metric', lcsc: 'C1523', mpn: '0402B102K500NT X7R', lib: 'basic', stock: 3491819 },
  { value: '100pF', footprint: 'C_0402_1005Metric', lcsc: 'C1546', mpn: '0402CG101J500NT C0G', lib: 'basic', stock: 3241789 },
  { value: '12pF', footprint: 'C_0402_1005Metric', lcsc: 'C1547', mpn: '0402CG120J500NT C0G', lib: 'basic', stock: 1742973 },
  { value: '10pF', footprint: 'C_0402_1005Metric', lcsc: 'C32949', mpn: 'CL05C100JB5NNNC C0G', lib: 'basic', stock: 1977549 },
  { value: '0.8pF', footprint: 'C_0402_1005Metric', lcsc: 'C88902', mpn: 'Murata GJM1555C1HR80WB01D C0G', lib: 'extended', stock: 212175 },
  { value: '0R', footprint: 'R_0402_1005Metric', lcsc: 'C17168', mpn: '0402WGF0000TCE', lib: 'basic', stock: 15188259 },
  { value: '47R', footprint: 'R_0402_1005Metric', lcsc: 'C25118', mpn: '0402WGF470JTCE', lib: 'basic', stock: 1383646 },
  { value: '1k', footprint: 'R_0402_1005Metric', lcsc: 'C11702', mpn: '0402WGF1001TCE 1%', lib: 'basic', stock: 31020148 },
  { value: '2k', footprint: 'R_0402_1005Metric', lcsc: 'C4109', mpn: '0402WGF2001TCE 1%', lib: 'basic', stock: 9905603 },
  { value: '2.2k', footprint: 'R_0402_1005Metric', lcsc: 'C25879', mpn: '0402WGF2201TCE 1%', lib: 'basic', stock: 3003372 },
  { value: '5.1k', footprint: 'R_0402_1005Metric', lcsc: 'C25905', mpn: '0402WGF5101TCE 1%', lib: 'basic', stock: 3570855 },
  { value: '10k', footprint: 'R_0402_1005Metric', lcsc: 'C25744', mpn: '0402WGF1002TCE 1%', lib: 'basic', stock: 20609005 },
  { value: '20k', footprint: 'R_0402_1005Metric', lcsc: 'C25765', mpn: '0402WGF2002TCE 1%', lib: 'basic', stock: 2830701 },
  { value: '100k', footprint: 'R_0402_1005Metric', lcsc: 'C25741', mpn: '0402WGF1003TCE 1%', lib: 'basic', stock: 10009917 },
  { value: '1M', footprint: 'R_0402_1005Metric', lcsc: 'C26083', mpn: '0402WGF1004TCE 1%', lib: 'basic', stock: 2264804 },
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
  [/^VSSOP-/, 270],
];
