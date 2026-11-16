# Subvocal Lidar firmware

Both boards use an nRF52832. They share the sensing code; only the link to the outside differs.

| Folder | What it is |
|---|---|
| [`common/`](common/) | `smi.c` fringe counter, `capture.c` 200 kS/s ADC capture, `laser.c` laser current and rail, `decoder.c` phrase matching (from Subvocal Radar), `keyboard.c` |
| [`wired/`](wired/) | Wired module: I2C target for the glasses' main processor, on-module training store. Bare metal, no SDK libraries |
| [`bluetooth/`](bluetooth/) | Bluetooth pod: BLE keyboard + training service, Nordic nRF5 SDK 17.1 + SoftDevice S132 |
| [`test/`](test/) | PC tests: `smi_test.c` (fringe counter on simulated self-mixing signals), `decoder_test.c` (parity with the C# decoder) |

Ready-to-flash images: [`wired/release/subvocal_lidar_wired.hex`](wired/release/) and
[`bluetooth/release/subvocal_lidar_bt_full.hex`](bluetooth/release/) (SoftDevice + application).

## Flashing

The nRF52832 is programmed over SWD through the test pads on the bottom of each board: TP1 SWDIO, TP2 SWDCLK,
TP3 RESET, TP4 3.3 V, TP5 GND. Any SWD probe works:

```bash
nrfjprog --program bluetooth/release/subvocal_lidar_bt_full.hex --chiperase --verify --reset     # SEGGER J-Link
pyocd flash -t nrf52832 wired/release/subvocal_lidar_wired.hex                                   # any CMSIS-DAP probe
```

A Raspberry Pi Pico running Raspberry Pi's *debugprobe* firmware is a cheap CMSIS-DAP probe.

## Building

Needs the GNU Arm Embedded toolchain, CMake + Ninja and the nRF5 SDK 17.1.0 (`NRF5_SDK`, default
`~/nordic/nRF5_SDK_17.1.0_ddde560`). The wired build only uses the SDK's MDK headers and startup files.

```bash
cd firmware/wired      # or firmware/bluetooth
cmake -G Ninja -B build -DCMAKE_TOOLCHAIN_FILE=../cmake/arm-gcc.cmake
cmake --build build
```

`bluetooth/main.c` is generated from Nordic's HID keyboard example by `gen_main.py` (keeps the example's
Bluetooth plumbing, adds `subvocal_app.c`); `sdk_files.cmake` comes from `gen_sdk_files.py`.

| Build | Flash | RAM |
|---|---|---|
| wired | 12.9 KB (of 384 KB) | 42 KB (of 64 KB) |
| bluetooth | 50 KB (of 232 KB) | 47 KB (of 52 KB after the SoftDevice) |

## Wired module: I2C interface

7-bit address **0x2C**, standard / fast mode, at the host's own I/O voltage (pin 3 of the FPC, 1.65-3.3 V).
`HOST_IRQ` (FPC pin 6) is open drain and goes **low** when there is something to read; reading `STATUS` releases it.
Multi-byte values are little-endian. Write = `[register, data...]`; read = write `[register]`, then read.

| Reg | Name | R/W | Content |
|---|---|---|---|
| 0x00 | WHO_AM_I | R | 0x5C |
| 0x01 | VERSION | R | 0x10 = 1.0 |
| 0x02 | STATUS | R | bit0 sensing, bit1 result ready, bit2 laser fault, bit3 no fringes in the last take, bit4 busy (flash), bit5 training take stored, bit6 FIFO data, bit7 training failed |
| 0x03 | COMMAND | W | 0x01 start a take, 0x02 stop and recognise, 0x03 stop and discard, 0x04 stop and store as a training take for TRAIN_SLOT, 0x10 erase all phrases, 0x11 delete TRAIN_SLOT, 0xA5 reset |
| 0x04 | LASER_CODE | R/W u16 | laser current, 0-4095 (5.71 µA per step; default 2970 = 17 mA; 4095 = 23.4 mA hardware limit) |
| 0x06 | PD_UA | R u16 | monitor photodiode current at the start of the take, µA |
| 0x08 | FRINGE_AMP | R u16 | fringe amplitude, ADC codes (signal quality) |
| 0x0A | FRAMES | R u16 | frames in the current / last take (200 per second, 600 max) |
| 0x0C | RESULT | R | i8 recognised slot (-1 none), i8 closest slot, u16 distance x1000, u16 threshold x1000 |
| 0x12 | SENSITIVITY | R/W u16 | acceptance factor x1000 (default 1800; higher accepts more) |
| 0x14 | PHRASES | R | number of trained phrases |
| 0x15 | FREE_KB | R | free training storage, KB (128 KB total) |
| 0x20 | TRAIN_SLOT | R/W | phrase slot 0-63 for the next training take |
| 0x21 | PHRASE_TEXT | W: slot + UTF-8 text (≤ 96 bytes) / R: text of the recognised (or closest) phrase, zero-terminated |
| 0x40 | FIFO | R | u8 n (≤ 60), then n x i16 skin displacement in fringes (0.775 µm), one per 5 ms frame, while sensing |

Typical host code:

```text
press:    write 0x03 = 0x01                      (laser on, recording)
release:  write 0x03 = 0x02                      (laser off, recognising)
IRQ low:  read 0x02 -> bit1 set -> read 0x0C, read 0x21 -> type / send the text
training: write 0x21 = [slot, "on my way"]; then for each take: press/release with 0x03 = 0x04 (5 takes per phrase)
```

## Bluetooth pod

Behaves like the Subvocal Radar v2: pairs as a keyboard ("Subvocal Lidar"), hold the side button, mouth a phrase,
release, the phrase is typed. Training uses the Subvocal service `6f9a0000-5b1e-4b8e-9a3c-2f0c7b8a5e01` with the
same commands and events, so the Radar v2 **Subvocal Trainer** apps (Windows, Android) work with it. Takes are sent
as phase (cos/sin of displacement / 0.391 mm), which the apps' decoder unwraps back to the same displacement.
One extra command: `0x12` + u16 sets the laser current code.

After 5 minutes of advertising without a connection the pod switches itself off; press the button to wake it.
