// SMI fringe counter (see smi.h). Per sample:
//   envelope  : peak trackers with ~2 ms decay give the fringe amplitude A = hi - lo (peak to peak)
//   ramp      : running mean of |x[k] - x[k-1]| on samples that are not edges (the slow side of the sawtooth + noise)
//   edge      : a step over two samples that is both large (> 0.45 A) and much steeper than the ramp (> 2.2 x two ramp
//               steps) is one fringe; its sign gives the direction of motion
//   refractory: 3 samples (15 us) after an edge, so one edge counts once
// Works up to ~15 mm/s skin speed (>= 10 samples per fringe at 200 kS/s); cheek and jaw-muscle skin moves slower when
// mouthing words.
#include "smi.h"

#include <math.h>

#define EDGE_FRAC    0.45f
#define RAMP_RATIO   2.2f
#define DECAY        0.0025f     // per sample: envelope relaxes over ~2 ms
#define MIN_AMP      12.0f       // ADC codes: below this there are no usable fringes
#define REFRACTORY   3

void smi_init(smi_t *s) {
    s->env_hi = -1e9f;            // first sample initialises the envelope
    s->env_lo = 0;
    s->noise = 4.0f;
    s->x1 = s->x2 = 0;
    s->refractory = 0;
    s->fringes = 0;
    s->edges_up = s->edges_down = 0;
}

float smi_amplitude(const smi_t *s) {
    float a = s->env_hi - s->env_lo;
    return a > 0 ? a : 0;
}

int smi_block(smi_t *s, const int16_t *x, int n) {
    int count = 0;
    for (int k = 0; k < n; k++) {
        float v = (float)x[k];
        if (s->env_hi < -1e8f) { s->env_hi = s->env_lo = v; s->x1 = s->x2 = x[k]; }
        if (v > s->env_hi) s->env_hi = v; else s->env_hi -= (s->env_hi - v) * DECAY;
        if (v < s->env_lo) s->env_lo = v; else s->env_lo += (v - s->env_lo) * DECAY;
        float amp = s->env_hi - s->env_lo;
        float step = v - (float)s->x2;                 // over two samples: an edge may straddle a sample
        float d1 = fabsf(v - (float)s->x1);
        int edge = 0;
        if (s->refractory > 0) s->refractory--;
        // at rest there are no fringes and the envelope shrinks to the noise: amp > 6 x noise keeps noise from counting
        else if (amp > MIN_AMP && amp > 6.0f * s->noise && fabsf(step) > EDGE_FRAC * amp && fabsf(step) > RAMP_RATIO * 2.0f * s->noise) {
            if (step > 0) { count--; s->edges_up++; } else { count++; s->edges_down++; }
            s->refractory = REFRACTORY;
            edge = 1;
        }
        if (!edge && s->refractory == 0) s->noise += (d1 - s->noise) * 0.01f;
        s->x2 = s->x1;
        s->x1 = x[k];
    }
    s->fringes += count;
    return count;
}
