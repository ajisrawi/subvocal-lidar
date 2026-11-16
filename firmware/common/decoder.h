// On-device phrase recogniser (from the Subvocal Radar v2 firmware): features + DTW + nearest-phrase decision.
// Features are stored as Q12 integers and DTW runs in integer arithmetic (it also runs on FPU-less chips).
// Plain C, no ESP-IDF dependency (firmware/test builds it on a PC against the C# decoder's fixture).
#pragma once
#include <stddef.h>
#include <stdint.h>

#define DEC_MMPERRAD        0.39108807f    // (299.792458 / 61.0) / (4 pi): mm of skin motion per radian
#define DEC_DECIMATION      4              // features at 50 Hz from the 200 Hz signal
#define DEC_MAX_IN          800            // longest input signal (4 s at 200 Hz)
#define DEC_MAX_FEAT        (DEC_MAX_IN / DEC_DECIMATION)
#define DEC_Q               4096.0f        // feature scale (Q12): z-scores up to +-7.99

#define DEC_MAX_PHRASES     64
#define DEC_MAX_TAKES       10
#define DEC_MAX_TEXT        96

// Motion features of the active part of a take: frames of [displacement, velocity], each z-normalised, Q12.
// Returns the number of frames written to out (2 int16 per frame), or 0 when the take holds no articulation.
int dec_features(const float *i, const float *q, int n, int16_t *out, int max_frames);
// Same, in float (for the PC parity test against the C# decoder).
int dec_features_f(const float *i, const float *q, int n, float *out, int max_frames);
// Same features from a skin-displacement signal in mm at 200 Hz (the lidar's fringe count x 0.775 um).
int dec_features_disp(const float *disp_mm, int n, int16_t *out, int max_frames);
int dec_features_disp_f(const float *disp_mm, int n, float *out, int max_frames);

// DTW distance (Sakoe-Chiba band, as Decoder.Dtw) normalised by path length, in feature units.
// abandon > 0: stop early and return INFINITY once the distance must exceed it.
float dec_dtw(const int16_t *a, int n, const int16_t *b, int m, float abandon);

// ---- trained model: binary "SVM1", written by the apps over Bluetooth (little-endian)
//   0 'S','V','M','1'   4 u16 phrase count   6 u16 reserved (0)
//   per phrase: u8 text length L, u8 take count, text (UTF-8, L bytes + one 0 byte if L is odd),
//               per take: u16 frames, frames x { i16 displacement, i16 velocity } (Q12)
//   Every field starts on an even offset, so the takes can be used in place from flash.
typedef struct {
    char text[DEC_MAX_TEXT + 1];
    int ntakes;
    const int16_t *take[DEC_MAX_TAKES];
    uint16_t frames[DEC_MAX_TAKES];
} dec_phrase_t;

typedef struct {
    int nphrases;
    dec_phrase_t phrase[DEC_MAX_PHRASES];
    float typical;          // median leave-one-out distance between takes of the same phrase (NAN if unknown)
} dec_model_t;

typedef struct {
    int phrase;             // index of the recognised phrase, -1 = nothing recognised
    int best;               // best phrase even when rejected (-1 if none)
    float distance, threshold;
    const char *reason;
} dec_result_t;

// Parses a model held in memory (data must stay valid: takes point into it). Returns 0 or a negative error.
int dec_model_parse(dec_model_t *m, const uint8_t *data, size_t len);
float dec_model_typical(const dec_model_t *m);   // computes the typical within-phrase distance
dec_result_t dec_recognize(const dec_model_t *m, const int16_t *f, int frames, float reject_scale);
