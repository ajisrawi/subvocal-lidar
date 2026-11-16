# Ordering the Bluetooth pod board from JLCPCB (PCB + assembly)

| File | Upload where |
|---|---|
| `subvocal-lidar-gerbers.zip` | "Add gerber file" on the PCB order page |
| `subvocal-lidar-BOM-JLCPCB.csv` | PCB Assembly > "Add BOM File" |
| `subvocal-lidar-CPL-JLCPCB.csv` | PCB Assembly > "Add CPL File" |
| `parts.md` | Not uploaded: part list with LCSC numbers, stock and fees |

All 67 assembled parts are on the **top side** (Economic PCBA). Not from JLCPCB: the 1550 nm laser LD1
([docs/LASER.md](../../../docs/LASER.md)) and the LiPo cell.

## PCB options

| Option | Choose | Why |
|---|---|---|
| Layers | **4** | Ground plane under the analog front end and the radio |
| Dimensions | 12 x 62 mm | From the outline (it includes the laser notch) |
| PCB thickness | **0.8 mm** | Thin pod |
| Surface finish | **ENIG** | 0.4 mm-pitch nRF52832 |
| Via | **0.2 mm / 0.45 mm** | |
| Specify stackup | JLCPCB default | The 2.4 GHz feed is short; the antenna has a 0R + two optional shunt pads for tuning |
| Mark on PCB | Remove mark | |

## Assembly options

Economic PCBA, top side, "Confirm parts placement" **on**. Check pin 1 in the preview for U1-U7 (U4 is the
nRF52832, U7 the TLV9062), Q1, D1, D2, Y1, AE1 (antenna: feed end towards L1/R10) and J1 (USB-C opening at the board end).

## Battery

A protected 3.7 V LiPo of about 100 mAh: **401030** (4 x 10 x 30 mm) fits the pod. Use a cell **with its own
protection board** (standard for small LiPo cells); the board has no separate protection IC. Solder its wires to BT1
(+ on the left pad). The charger (MCP73831) charges at 100 mA from USB-C; the red LED is on while charging.

## Regenerate

```bash
node bluetooth/hardware/scripts/make_footprints.mjs
node bluetooth/hardware/scripts/make_schematic.mjs
node bluetooth/hardware/scripts/make_board.mjs
node bluetooth/hardware/scripts/make_jlc.mjs
```
