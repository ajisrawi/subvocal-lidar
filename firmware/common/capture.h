// One take: the laser on, the fringe signal sampled continuously at 200 kS/s, one displacement value per 5 ms frame.
#pragma once
#include <stdbool.h>
#include <stdint.h>

#define CAP_MAX_FRAMES   600         // 3 s at 200 frames/s
#define CAP_IRQ_PRIORITY 6           // allowed with or without the Bluetooth SoftDevice

typedef void (*capture_frame_cb_t)(int32_t fringes);   // called from the ADC interrupt after every frame

void capture_init(capture_frame_cb_t on_frame);
// Laser on at the given current, then sampling. False if the laser's photodiode sees no light (laser fault).
bool capture_start(uint16_t laser_code);
int capture_stop(void);                      // sampling and laser off; returns the frames recorded
bool capture_running(void);
int capture_frames(void);
const float *capture_disp_mm(void);          // skin displacement per frame, mm (fringes x 0.775 um)
float capture_pd_ua(void);                   // photodiode current measured at the start of the take
float capture_amplitude(void);               // fringe amplitude, ADC codes (signal quality: 0 = no fringes)
