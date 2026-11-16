// Self-mixing interferometry (SMI) fringe counter.
//
// The laser's monitor photodiode signal (after the AC gain stage, sampled at SMI_FS) shows one fringe per half
// wavelength of target movement: 0.775 um at 1550 nm. With moderate optical feedback (C > 1) each fringe is a
// sawtooth whose steep edge points one way when the skin moves towards the glasses and the other way when it moves
// away. Counting steep edges with their sign gives signed displacement, which is what the phrase matcher needs.
// Plain C, no SDK: firmware/test/smi_test.c checks it on simulated SMI signals.
#pragma once
#include <stdint.h>

#define SMI_FS            200000      // ADC samples per second
#define SMI_BLOCK         1000        // samples per block = one 5 ms frame (200 frames/s)
#define SMI_HALF_LAMBDA_MM 0.000775f  // displacement per fringe, mm

typedef struct {
    float env_hi, env_lo;       // slow envelope of the signal (fringe amplitude = hi - lo)
    float noise;                // running estimate of sample-to-sample noise
    int16_t x1, x2;             // previous two samples
    int refractory;             // samples left before another edge may count
    int32_t fringes;            // signed fringe count since smi_init
    uint32_t edges_up, edges_down;
} smi_t;

void smi_init(smi_t *s);
// Processes n samples (ADC codes, any offset). Returns the signed fringe count of this block.
int smi_block(smi_t *s, const int16_t *x, int n);
// Fringe amplitude in ADC codes (0 when no interference is seen: laser off, nothing in front, out of focus).
float smi_amplitude(const smi_t *s);
