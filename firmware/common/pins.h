// nRF52832 pins of the laser front end: the same on the wired module and the Bluetooth pod
// (wired/hardware/scripts/make_schematic.mjs, bluetooth/hardware/scripts/make_schematic.mjs).
#pragma once

#define PIN_SMI_AC      2     // P0.02 / AIN0: fringes (AC gain stage, around 1.65 V)
#define AIN_SMI_AC      1     // SAADC PSELP value for AIN0
#define PIN_PD_DC       3     // P0.03 / AIN1: photodiode TIA output = 3.0 V - I_pd x 2.2 kOhm
#define AIN_PD_DC       2     // SAADC PSELP value for AIN1
#define PIN_ANA_EN      5     // P0.05: +3V3_A (laser, op-amps, DAC) on
#define PIN_DAC_SCLK    6     // P0.06
#define PIN_DAC_DIN     7     // P0.07
#define PIN_DAC_SYNC    8     // P0.08

// laser current: DAC (12 bit, 0-3.3 V) / 3 across 47 R  ->  I = code x 3.3 / 4096 / 3 / 47 = code x 5.71 uA
#define LASER_UA_PER_CODE   5.714f
#define LASER_CODE_MAX      4095          // 23.4 mA: hardware limit of the current sink
#define LASER_CODE_DEFAULT  2970          // 17 mA, a typical operating point for a 1550 nm DFB (threshold ~8-10 mA)
#define VREF_HI_V           3.0f          // TIA reference (10k / 100k from +3V3_A)
#define TIA_OHMS            2200.0f
