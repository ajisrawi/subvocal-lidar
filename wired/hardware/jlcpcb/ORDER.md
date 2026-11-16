# Ordering the wired module from JLCPCB (PCB + assembly)

| File | Upload where |
|---|---|
| `subvocal-lidar-wired-gerbers.zip` | "Add gerber file" on the PCB order page |
| `subvocal-lidar-wired-BOM-JLCPCB.csv` | PCB Assembly > "Add BOM File" |
| `subvocal-lidar-wired-CPL-JLCPCB.csv` | PCB Assembly > "Add CPL File" |
| `parts.md` | Not uploaded: part list with LCSC numbers, stock and fees |

All 47 assembled parts are on the **top side** (Economic PCBA). Not from JLCPCB: the 1550 nm laser LD1
([docs/LASER.md](../../../docs/LASER.md)).

## PCB options

| Option | Choose |
|---|---|
| Layers | **4** |
| Dimensions | 11 x 41 mm (from the outline, with the laser corner cut-out) |
| PCB thickness | **0.8 mm** |
| Surface finish | **ENIG** (0.4 mm-pitch nRF52832, 0.5 mm-pitch FPC connector) |
| Via | **0.2 mm / 0.45 mm** |
| Mark on PCB | Remove mark |

## Assembly options

Economic PCBA, top side, "Confirm parts placement" **on**. Check pin 1 in the preview for U2-U8, Q1 and J1
(the FPC connector's opening faces the board's front end).

## Connecting it to the glasses

6-way 0.5 mm FPC (bottom contacts, flex 0.3 mm thick):

| Pin | Signal | Host side |
|---|---|---|
| 1 | VIN | 3.3-5.5 V, about 35 mA while sensing (laser ~20 mA + analog + CPU), microamps when idle (not yet measured) |
| 2 | GND | |
| 3 | VDDIO | the host's I/O voltage, 1.65-3.3 V (I2C and IRQ levels) |
| 4 | SDA | I2C data (10 kΩ pull-ups on the module) |
| 5 | SCL | I2C clock |
| 6 | IRQ | open drain, low = read STATUS |

Register map and host flow: [firmware/README.md](../../../firmware/README.md).

## Regenerate

```bash
node wired/hardware/scripts/make_schematic.mjs
node wired/hardware/scripts/make_board.mjs
node wired/hardware/scripts/make_jlc.mjs
```
