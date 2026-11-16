// PC test of the SMI fringe counter (firmware/common/smi.c) on simulated self-mixing signals.
//   clang -O2 -I../common smi_test.c ../common/smi.c -o smi_test && ./smi_test
// The simulation solves the standard steady-state self-mixing phase equation (Lang-Kobayashi):
//     phi_F = phi_0 - C sin(phi_F + atan(alpha)),   phi_0 = 4 pi d / lambda
// following the solution branch from sample to sample, so for C > 1 it jumps between branches and produces the
// sawtooth fringes with hysteresis that a real laser shows. The photodiode sees P ~ 1 + m cos(phi_F); the test adds
// the AC gain, noise and 12-bit quantisation, runs the counter and compares the recovered displacement with the truth.
#include <math.h>
#include <stdio.h>
#include <stdlib.h>

#include "smi.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif
#define LAMBDA 1.55e-6

static double alpha_th;
static double f(double phi, double phi0, double C) { return phi - phi0 + C * sin(phi + alpha_th); }

// root of f nearest to prev (continuation): Newton first, scan + bisection when the branch ends
static double solve(double prev, double phi0, double C) {
    double p = prev;
    for (int it = 0; it < 30; it++) {
        double fp = 1 + C * cos(p + alpha_th);
        if (fabs(fp) < 1e-6) break;
        double np = p - f(p, phi0, C) / fp;
        if (fabs(np - prev) > 1.0) break;          // left the branch: fall back to scanning
        if (fabs(np - p) < 1e-12) return np;
        p = np;
    }
    double best = prev, bestd = 1e9;
    for (int k = -400; k < 400; k++) {
        double a = prev + k * 0.02, b = a + 0.02;
        double fa = f(a, phi0, C), fb = f(b, phi0, C);
        if ((fa <= 0) != (fb <= 0)) {
            for (int it = 0; it < 60; it++) { double m = 0.5 * (a + b), fm = f(m, phi0, C); if ((fa <= 0) != (fm <= 0)) { b = m; } else { a = m; fa = fm; } }
            double r = 0.5 * (a + b);
            if (1 + C * cos(r + alpha_th) <= 0) continue;     // unstable solution: a real laser never stays there
            if (fabs(r - prev) < bestd) { bestd = fabs(r - prev); best = r; }
        }
    }
    return best;
}

static double gauss(void) { double u = 1 - rand() / (RAND_MAX + 1.0), v = rand() / (RAND_MAX + 1.0); return sqrt(-2 * log(u)) * cos(2 * M_PI * v); }

// one take: articulation-like skin motion, peak speed set by the pulse amplitude
static int run(double C, double amp_mm, double noise, double amplitude_codes, int quiet) {
    const double T = 1.0;
    const int N = (int)(T * SMI_FS);
    alpha_th = atan(4.0);                     // linewidth enhancement factor of a DFB laser, ~4
    smi_t s; smi_init(&s);
    static int16_t blk[SMI_BLOCK];
    double phiF = 0, maxerr = 0, maxd = 0, vmax = 0, prevd = 0;
    int nb = 0;
    for (int k = 0; k < N; k++) {
        double t = (double)k / SMI_FS;
        double d = 0;   // m: three gestures, like mouthing a short word
        d += amp_mm * 1e-3 * exp(-0.5 * pow((t - 0.30) / 0.05, 2));
        d -= 0.6 * amp_mm * 1e-3 * exp(-0.5 * pow((t - 0.50) / 0.04, 2));
        d += 0.8 * amp_mm * 1e-3 * exp(-0.5 * pow((t - 0.70) / 0.06, 2));
        if (k) vmax = fmax(vmax, fabs(d - prevd) * SMI_FS);
        prevd = d;
        double phi0 = 4 * M_PI * d / LAMBDA;
        phiF = (k == 0) ? solve(phi0, phi0, C) : solve(phiF, phi0, C);
        double v = 2048 + amplitude_codes * cos(phiF) + noise * gauss();
        if (v < 0) v = 0; if (v > 4095) v = 4095;
        blk[nb++] = (int16_t)v;
        if (nb == SMI_BLOCK) {
            smi_block(&s, blk, nb); nb = 0;
            double est = s.fringes * SMI_HALF_LAMBDA_MM * 1e-3;
            maxerr = fmax(maxerr, fabs(est - d));
            maxd = fmax(maxd, fabs(d));
        }
    }
    // pass: tracked within 3 fringes + 2 % of the movement all through the take (speech features use 100s of um)
    double tol = 3 * SMI_HALF_LAMBDA_MM * 1e-3 + 0.02 * maxd;
    int ok = maxerr < tol;
    if (!quiet) printf("C=%.1f  peak %.3f mm  max speed %5.1f mm/s  noise %4.1f  -> edges %6u / %6u, end %4d fringes, max error %6.2f um of %6.1f um allowed (%s)\n",
                       C, maxd * 1e3, vmax * 1e3, noise, s.edges_up, s.edges_down, s.fringes, maxerr * 1e6, tol * 1e6, ok ? "ok" : "FAIL");
    return ok;
}

int main(void) {
    srand(7);
    int pass = 0, total = 0;
    const double C[] = { 1.5, 3.0, 4.0 };      // moderate feedback, the working range (above ~4.6 fringes get skipped)
    const double A[] = { 0.05, 0.4, 1.2 };      // mm: 1.2 mm pulses reach ~15 mm/s (the design limit)
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 3; j++) { total++; pass += run(C[i], A[j], 4.0, 450, 0); }
    total++; pass += run(3.0, 0.4, 25.0, 450, 0);   // noisy
    total++; pass += run(3.0, 0.4, 45.0, 450, 0);   // very noisy
    total++; pass += run(3.0, 0.4, 4.0, 60, 0);     // weak fringes (target out of focus)
    printf("%d of %d cases tracked the skin movement\n", pass, total);
    printf("beyond the design limit (information only):\n");
    run(3.0, 2.0, 4.0, 450, 0);   // too fast: < 7 samples per fringe
    run(6.0, 0.4, 4.0, 450, 0);   // too much feedback: multi-fringe jumps
    return pass == total ? 0 : 1;
}
