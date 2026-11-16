// Phrase recogniser, from the Subvocal Radar firmware (github.com/ajisrawi/subvocal-radar-v2, firmware/main/decoder.c),
// itself a C port of the apps' C# decoder. Here it also takes a displacement signal directly (the lidar counts fringes).


#include "decoder.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static float d_buf[DEC_MAX_IN], vs_buf[DEC_MAX_IN], e_buf[DEC_MAX_IN], sorted_buf[DEC_MAX_IN];

static int cmp_float(const void *a, const void *b) {
    float x = *(const float *)a, y = *(const float *)b;
    return (x > y) - (x < y);
}

static int features_from_displacement(int n, float *out, int max_frames);

int dec_features_f(const float *i, const float *q, int n, float *out, int max_frames) {
    if (n < 40) return 0;
    if (n > DEC_MAX_IN) n = DEC_MAX_IN;
    float *d = d_buf;

    // displacement (unwrapped phase), mm
    double last = 0, un = 0;
    for (int k = 0; k < n; k++) {
        double p = atan2((double)q[k], (double)i[k]);
        if (k > 0) {
            double dp = p - last;
            if (dp > M_PI) dp -= 2 * M_PI;
            if (dp < -M_PI) dp += 2 * M_PI;
            un += dp;
        }
        last = p;
        d[k] = (float)(un * DEC_MMPERRAD);
    }
    return features_from_displacement(n, out, max_frames);
}

int dec_features_disp_f(const float *disp_mm, int n, float *out, int max_frames) {
    if (n < 40) return 0;
    if (n > DEC_MAX_IN) n = DEC_MAX_IN;
    memcpy(d_buf, disp_mm, (size_t)n * sizeof(float));
    return features_from_displacement(n, out, max_frames);
}

// motion features from d_buf[0..n): the part shared by the radar (phase) and lidar (fringe count) front ends
static int features_from_displacement(int n, float *out, int max_frames) {
    float *d = d_buf, *vs = vs_buf, *e = e_buf;
    // velocity, 3-point smoothed (v[0] = 0 as in the C# code)
    for (int k = 0; k < n; k++) {
        float vk = k > 0 ? d[k] - d[k - 1] : 0.0f;
        int a = k > 0 ? k - 1 : 0, c = k < n - 1 ? k + 1 : n - 1;
        float va = a > 0 ? d[a] - d[a - 1] : 0.0f, vc = c > 0 ? d[c] - d[c - 1] : 0.0f;
        vs[k] = (va + vk + vc) / 3.0f;
    }
    // activity: 50 ms moving average of |velocity|
    double acc = 0;
    for (int k = 0; k < n; k++) {
        acc += fabsf(vs[k]);
        if (k >= 10) acc -= fabsf(vs[k - 10]);
        e[k] = (float)(acc / (k + 1 < 10 ? k + 1 : 10));
    }
    memcpy(sorted_buf, e, (size_t)n * sizeof(float));
    qsort(sorted_buf, (size_t)n, sizeof(float), cmp_float);
    float floor_ = sorted_buf[(int)(0.2 * (n - 1))], peak = sorted_buf[n - 1];
    if (peak < 4 * floor_ || peak < 1e-4f) return 0;
    float thr = 3 * floor_ > 0.08f * peak ? 3 * floor_ : 0.08f * peak;

    int s = 0, t = n - 1;
    while (s < n && e[s] < thr) s++;
    while (t > s && e[t] < thr) t--;
    s = s - 20 > 0 ? s - 20 : 0;
    t = t + 20 < n - 1 ? t + 20 : n - 1;
    int len = t - s + 1;
    if (len < 30) return 0;

    double md = 0, mv = 0;
    for (int k = s; k <= t; k++) { md += d[k]; mv += vs[k]; }
    md /= len; mv /= len;
    double sd = 0, sv = 0;
    for (int k = s; k <= t; k++) { sd += (d[k] - md) * (d[k] - md); sv += (vs[k] - mv) * (vs[k] - mv); }
    sd = sqrt(sd / len) + 1e-9; sv = sqrt(sv / len) + 1e-9;

    int m = len / DEC_DECIMATION;
    if (m > max_frames) m = max_frames;
    for (int j = 0; j < m; j++) {
        double fd = 0, fv = 0;
        for (int r = 0; r < DEC_DECIMATION; r++) { int k = s + j * DEC_DECIMATION + r; fd += (d[k] - md) / sd; fv += (vs[k] - mv) / sv; }
        out[2 * j] = (float)(fd / DEC_DECIMATION);
        out[2 * j + 1] = (float)(fv / DEC_DECIMATION);
    }
    return m;
}

static inline int16_t q12(float v) {
    float x = v * DEC_Q;
    if (x > 32767.0f) x = 32767.0f;
    if (x < -32768.0f) x = -32768.0f;
    return (int16_t)lrintf(x);
}

int dec_features(const float *i, const float *q, int n, int16_t *out, int max_frames) {
    static float f[2 * DEC_MAX_FEAT];
    if (max_frames > DEC_MAX_FEAT) max_frames = DEC_MAX_FEAT;
    int m = dec_features_f(i, q, n, f, max_frames);
    for (int k = 0; k < 2 * m; k++) out[k] = q12(f[k]);
    return m;
}

int dec_features_disp(const float *disp_mm, int n, int16_t *out, int max_frames) {
    static float f[2 * DEC_MAX_FEAT];
    if (max_frames > DEC_MAX_FEAT) max_frames = DEC_MAX_FEAT;
    int m = dec_features_disp_f(disp_mm, n, f, max_frames);
    for (int k = 0; k < 2 * m; k++) out[k] = q12(f[k]);
    return m;
}

static inline uint32_t isqrt32(uint32_t x) {
    uint32_t r = 0, b = 1u << 30;
    while (b > x) b >>= 2;
    while (b) {
        if (x >= r + b) { x -= r + b; r = (r >> 1) + b; }
        else r >>= 1;
        b >>= 2;
    }
    return r;
}

/** round(i * m / n) with .NET's default rounding (half to even), as Math.Round in the C# code */
static inline int round_ratio(int i, int m, int n) {
    int p = i * m, qv = p / n, rem = p % n;
    if (2 * rem > n || (2 * rem == n && (qv & 1))) qv++;
    return qv;
}

float dec_dtw(const int16_t *a, int n, const int16_t *b, int m, float abandon) {
    if (n <= 0 || m <= 0) return INFINITY;
    static uint32_t rows[2][DEC_MAX_FEAT + 1];
    if (m > DEC_MAX_FEAT || n > DEC_MAX_FEAT) return INFINITY;
    const uint32_t INF = 0xFFFFFFFFu;
    int big = n > m ? n : m, diff = n > m ? n - m : m - n;
    int band = (diff > (int)(0.3 * big) ? diff : (int)(0.3 * big)) + 1;
    uint32_t limit = abandon > 0 ? (uint32_t)fminf(abandon * DEC_Q * (float)(n + m), 4.0e9f) : INF;
    uint32_t *prev = rows[0], *cur = rows[1];
    for (int j = 0; j <= m; j++) prev[j] = INF;
    prev[0] = 0;
    for (int i = 1; i <= n; i++) {
        for (int j = 0; j <= m; j++) cur[j] = INF;
        int jc = round_ratio(i, m, n);
        int j0 = jc - band > 1 ? jc - band : 1, j1 = jc + band < m ? jc + band : m;
        uint32_t row_min = INF;
        const int32_t ax = a[2 * (i - 1)], ay = a[2 * (i - 1) + 1];
        for (int j = j0; j <= j1; j++) {
            int64_t dx = ax - b[2 * (j - 1)], dy = ay - b[2 * (j - 1) + 1];
            uint64_t s2 = (uint64_t)(dx * dx + dy * dy);
            uint32_t c = isqrt32(s2 > 0xFFFFFFFFull ? 0xFFFFFFFFu : (uint32_t)s2);
            uint32_t best = prev[j - 1];
            if (prev[j] < best) best = prev[j];
            if (cur[j - 1] < best) best = cur[j - 1];
            uint32_t v = best == INF ? INF : best + c;
            cur[j] = v;
            if (v < row_min) row_min = v;
        }
        if (row_min > limit) return INFINITY;     // every path through this row already costs too much
        uint32_t *tmp = prev; prev = cur; cur = tmp;
    }
    if (prev[m] == INF) return INFINITY;
    return (float)prev[m] / DEC_Q / (float)(n + m);
}

int dec_model_parse(dec_model_t *m, const uint8_t *data, size_t len) {
    memset(m, 0, sizeof *m);
    m->typical = NAN;
    if (len < 8 || memcmp(data, "SVM1", 4) != 0) return -1;
    int count = data[4] | (data[5] << 8);
    if (count > DEC_MAX_PHRASES) return -2;
    size_t off = 8;
    for (int p = 0; p < count; p++) {
        if (off + 2 > len) return -3;
        int tl = data[off], nt = data[off + 1];
        off += 2;
        int padded = (tl + 1) & ~1;                               // text padded to an even length: takes stay 2-aligned
        if (off + (size_t)padded > len) return -3;
        dec_phrase_t *ph = &m->phrase[m->nphrases];
        int keep = tl > DEC_MAX_TEXT ? DEC_MAX_TEXT : tl;
        memcpy(ph->text, data + off, keep); ph->text[keep] = 0;
        off += padded;
        for (int t = 0; t < nt; t++) {
            if (off + 2 > len) return -3;
            int fr = data[off] | (data[off + 1] << 8);
            off += 2;
            if (off + (size_t)fr * 4 > len) return -3;
            if (((uintptr_t)(data + off) & 1) != 0) return -4;     // the model buffer itself must be 2-aligned
            if (ph->ntakes < DEC_MAX_TAKES && fr > 0 && fr <= DEC_MAX_FEAT) {
                ph->take[ph->ntakes] = (const int16_t *)(data + off);
                ph->frames[ph->ntakes] = (uint16_t)fr;
                ph->ntakes++;
            }
            off += (size_t)fr * 4;
        }
        if (ph->ntakes > 0) m->nphrases++;
    }
    return 0;
}

static int cmp_f(const void *a, const void *b) { return cmp_float(a, b); }

float dec_model_typical(const dec_model_t *m) {
    static float within[DEC_MAX_PHRASES * DEC_MAX_TAKES];
    int nw = 0;
    for (int p = 0; p < m->nphrases; p++) {
        const dec_phrase_t *ph = &m->phrase[p];
        for (int a = 0; a < ph->ntakes; a++) {
            float best = INFINITY;
            for (int b = 0; b < ph->ntakes; b++) {
                if (a == b) continue;
                float dd = dec_dtw(ph->take[a], ph->frames[a], ph->take[b], ph->frames[b], best);
                if (dd < best) best = dd;
            }
            if (isfinite(best)) within[nw++] = best;
        }
    }
    if (!nw) return NAN;
    qsort(within, (size_t)nw, sizeof(float), cmp_f);
    return within[nw / 2];
}

dec_result_t dec_recognize(const dec_model_t *m, const int16_t *f, int frames, float reject_scale) {
    dec_result_t r = { .phrase = -1, .best = -1, .distance = INFINITY, .threshold = INFINITY, .reason = "" };
    if (m->nphrases == 0) { r.reason = "no phrases trained yet"; return r; }
    if (frames <= 0) { r.reason = "no movement detected"; return r; }
    for (int p = 0; p < m->nphrases; p++)
        for (int t = 0; t < m->phrase[p].ntakes; t++) {
            float dd = dec_dtw(f, frames, m->phrase[p].take[t], m->phrase[p].frames[t], isfinite(r.distance) ? r.distance : 0);
            if (dd < r.distance) { r.distance = dd; r.best = p; }
        }
    r.threshold = isnan(m->typical) ? INFINITY : reject_scale * m->typical;
    if (r.best >= 0 && r.distance <= r.threshold) { r.phrase = r.best; r.reason = "ok"; }
    else r.reason = "not close to any trained phrase";
    return r;
}
