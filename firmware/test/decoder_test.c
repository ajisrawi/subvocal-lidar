// PC test: the firmware's C decoder (main/decoder.c) against the C# decoder, on the fixture the C# test writes
// (decoder_fixture.txt next to this file, written by the v1 repository's C# decoder test: PCM of 7 synthetic takes + the C# results).
//   clang -O2 -I../main decoder_test.c ../main/decoder.c -o decoder_test && ./decoder_test <fixture>
// Features must match to float precision; DTW runs on Q12 integers on the device, so distances match to ~0.5 %.
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "decoder.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define MAXT 8
#define MAXPCM 64000
static char name[MAXT][8], word[MAXT][32];
static short *pcm[MAXT];
static int npcm[MAXT], nt;
static float I[MAXT][DEC_MAX_IN], Q[MAXT][DEC_MAX_IN];
static int niq[MAXT];
static int16_t F[MAXT][2 * DEC_MAX_FEAT];
static int nf[MAXT];
static int fails, checks;

// C# Decoder.Demodulate (the v1 audio path; on v2 the device sends I/Q directly)
static int demodulate(const short *x, int n, int rate, float *oi, float *oq, int max) {
    double w = 2 * M_PI * 2000.0 / rate, a = 1 - exp(-2 * M_PI * 150.0 / rate);
    int dec = (int)lround(rate / 200.0), cnt = 0, k2 = 0;
    double ph = 0, li = 0, lq = 0, lj = 0, lk = 0;
    static float ti[MAXPCM], tq[MAXPCM];
    for (int k = 0; k < n; k++) {
        double v = x[k] / 32768.0, c = cos(ph), s = sin(ph);
        ph += w; if (ph > 2 * M_PI) ph -= 2 * M_PI;
        li += a * (2 * v * c - li); lq += a * (-2 * v * s - lq);
        lj += a * (li - lj); lk += a * (lq - lk);
        if (++cnt >= dec) { cnt = 0; ti[k2] = (float)lj; tq[k2] = (float)lk; k2++; }
    }
    int skip = k2 < 12 ? k2 : 12, m = 0;
    for (int k = skip; k < k2 && m < max; k++, m++) { oi[m] = ti[k]; oq[m] = tq[k]; }
    return m;
}

static void close_to(const char *what, double expected, double actual, double rel) {
    double tol = rel * fmax(1.0, fabs(expected));
    checks++;
    if (fabs(expected - actual) > tol) { fails++; printf("FAIL %s: expected %.9g, got %.9g\n", what, expected, actual); }
}

static int idx(const char *n) { for (int k = 0; k < nt; k++) if (!strcmp(name[k], n)) return k; return -1; }

int main(int argc, char **argv) {
    const char *path = argc > 1 ? argv[1] : "decoder_fixture.txt";
    FILE *fp = fopen(path, "rb");
    if (!fp) { printf("cannot open %s\n", path); return 2; }
    static char line[1 << 20];
    while (fgets(line, sizeof line, fp)) {
        char *tok = strtok(line, " \r\n");
        if (!tok) continue;
        if (!strcmp(tok, "pcm")) {
            int k = nt++;
            strcpy(name[k], strtok(NULL, " ")); strcpy(word[k], strtok(NULL, " "));
            for (char *c = word[k]; *c; c++) if (*c == '_') *c = ' ';
            pcm[k] = malloc(MAXPCM * sizeof(short));
            char *v;
            while ((v = strtok(NULL, " \r\n")) && npcm[k] < MAXPCM) pcm[k][npcm[k]++] = (short)atoi(v);
            niq[k] = demodulate(pcm[k], npcm[k], 16000, I[k], Q[k], DEC_MAX_IN);
            nf[k] = dec_features(I[k], Q[k], niq[k], F[k], DEC_MAX_FEAT);
        } else if (!strcmp(tok, "iq")) {
            int k = idx(strtok(NULL, " "));
            int len = atoi(strtok(NULL, " "));
            double si = atof(strtok(NULL, " ")), sq = atof(strtok(NULL, " ")), sa = atof(strtok(NULL, " "));
            double ai = 0, aq = 0, aa = 0;
            for (int j = 0; j < niq[k]; j++) { ai += I[k][j]; aq += Q[k][j]; aa += fabs(I[k][j]); }
            checks++; if (len != niq[k]) { fails++; printf("FAIL %s I/Q length %d vs %d\n", name[k], len, niq[k]); }
            close_to("sum I", si, ai, 1e-4); close_to("sum Q", sq, aq, 1e-4); close_to("sum |I|", sa, aa, 1e-4);
        } else if (!strcmp(tok, "feat")) {
            int k = idx(strtok(NULL, " "));
            int len = atoi(strtok(NULL, " "));
            double en = atof(strtok(NULL, " ")), sum = atof(strtok(NULL, " "));
            static float ff[2 * DEC_MAX_FEAT];
            int m = dec_features_f(I[k], Q[k], niq[k], ff, DEC_MAX_FEAT);
            checks++; if (len != m) { fails++; printf("FAIL %s feature frames %d vs %d\n", name[k], len, m); continue; }
            double e = 0, s = 0;
            for (int j = 0; j < m; j++) { e += (double)ff[2 * j] * ff[2 * j]; s += ff[2 * j + 1]; }
            close_to("feature energy", en, e, 1e-4); close_to("feature sum", sum, s, 1e-3);
        } else if (!strcmp(tok, "dtw")) {
            int a = idx(strtok(NULL, " ")), b = idx(strtok(NULL, " "));
            double exp_d = atof(strtok(NULL, " "));
            double got = dec_dtw(F[a], nf[a], F[b], nf[b], 0);
            char what[64]; snprintf(what, sizeof what, "dtw %s-%s", name[a], name[b]);
            close_to(what, exp_d, got, 5e-3);
        } else if (!strcmp(tok, "rec")) {
            int k = idx(strtok(NULL, " "));
            char text[64]; strcpy(text, strtok(NULL, " "));
            for (char *c = text; *c; c++) if (*c == '_') *c = ' ';
            double dist = atof(strtok(NULL, " ")), thr = atof(strtok(NULL, " "));
            // build an SVM1 model from takes 0..5, exactly as the apps will upload it
            static uint8_t buf[65536] __attribute__((aligned(4)));
            size_t off = 8; int phrases = 0;
            memcpy(buf, "SVM1", 4); buf[6] = buf[7] = 0;
            for (int t = 0; t < 6; t++) {
                int first = 1;
                for (int u = 0; u < t; u++) if (!strcmp(word[u], word[t])) first = 0;
                if (!first) continue;
                int count = 0; for (int u = 0; u < 6; u++) if (!strcmp(word[u], word[t])) count++;
                int tl = (int)strlen(word[t]);
                buf[off++] = (uint8_t)tl; buf[off++] = (uint8_t)count;
                memcpy(buf + off, word[t], tl); off += tl; if (tl & 1) buf[off++] = 0;
                for (int u = 0; u < 6; u++) if (!strcmp(word[u], word[t])) {
                    buf[off++] = (uint8_t)nf[u]; buf[off++] = (uint8_t)(nf[u] >> 8);
                    memcpy(buf + off, F[u], (size_t)nf[u] * 4); off += (size_t)nf[u] * 4;
                }
                phrases++;
            }
            buf[4] = (uint8_t)phrases; buf[5] = 0;
            static dec_model_t model;
            int st = dec_model_parse(&model, buf, off);
            checks++; if (st) { fails++; printf("FAIL model parse %d\n", st); continue; }
            model.typical = dec_model_typical(&model);
            dec_result_t r = dec_recognize(&model, F[k], nf[k], 1.8f);
            const char *got = r.phrase >= 0 ? model.phrase[r.phrase].text : "-";
            checks++; if (strcmp(got, text)) { fails++; printf("FAIL recognised '%s', expected '%s'\n", got, text); }
            close_to("recognition distance", dist, r.distance, 5e-3);
            close_to("recognition threshold", thr, r.threshold, 5e-3);
            printf("recognised '%s' (distance %.4f, threshold %.4f; C#: %.4f, %.4f), model %zu bytes\n", got, r.distance, r.threshold, dist, thr, off);
        }
    }
    printf("%d checks, %d failed\n", checks, fails);
    return fails ? 1 : 0;
}
