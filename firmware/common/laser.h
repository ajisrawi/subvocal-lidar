// 1550 nm laser: analog rail, DAC7311 current set point, photodiode check.
#pragma once
#include <stdbool.h>
#include <stdint.h>

void laser_init(void);                      // rail off, SPI set up
// Rail on, current ramped to code over ~6 ms (gentle on the laser). Returns the monitor photodiode current in uA
// (0 if the laser does not light: not fitted, wrong way round, broken).
float laser_on(uint16_t code);
void laser_off(void);                       // current ramped down, rail off
bool laser_is_on(void);
float laser_pd_ua(void);                    // photodiode current now (single ADC reading; the laser must be on)
void laser_set_code(uint16_t code);         // change the current while on (clamped to LASER_CODE_MAX)
uint16_t laser_code(void);
