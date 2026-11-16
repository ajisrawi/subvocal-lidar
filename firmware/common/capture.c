// Continuous SAADC sampling of the fringe signal: internal sample timer at 16 MHz / 80 = 200 kS/s, EasyDMA into two
// 1000-sample buffers (5 ms each). On every END the next buffer is started and the finished one goes through the
// fringe counter; the running count becomes one displacement value per frame.
#include "capture.h"

#include <string.h>

#include "hw.h"
#include "laser.h"
#include "pins.h"
#include "smi.h"

static int16_t buf[2][SMI_BLOCK];
static volatile int filling;               // buffer the ADC writes into
static volatile bool running;
static volatile int frames;
static float disp[CAP_MAX_FRAMES];
static smi_t smi;
static float pd_ua;
static capture_frame_cb_t frame_cb;

void capture_init(capture_frame_cb_t on_frame) {
    frame_cb = on_frame;
    laser_init();
    NVIC_SetPriority(SAADC_IRQn, CAP_IRQ_PRIORITY);
}

static void saadc_continuous(void) {
    NRF_SAADC->ENABLE = 1;
    NRF_SAADC->RESOLUTION = SAADC_RESOLUTION_VAL_12bit;
    NRF_SAADC->OVERSAMPLE = 0;
    NRF_SAADC->CH[0].PSELP = AIN_SMI_AC;
    NRF_SAADC->CH[0].PSELN = SAADC_CH_PSELN_PSELN_NC;
    NRF_SAADC->CH[0].CONFIG = (SAADC_CH_CONFIG_GAIN_Gain1_4 << SAADC_CH_CONFIG_GAIN_Pos) | (SAADC_CH_CONFIG_REFSEL_VDD1_4 << SAADC_CH_CONFIG_REFSEL_Pos) |
                              (SAADC_CH_CONFIG_TACQ_3us << SAADC_CH_CONFIG_TACQ_Pos);
    NRF_SAADC->EVENTS_CALIBRATEDONE = 0;
    NRF_SAADC->TASKS_CALIBRATEOFFSET = 1;
    while (!NRF_SAADC->EVENTS_CALIBRATEDONE) { }
    NRF_SAADC->EVENTS_CALIBRATEDONE = 0;
    NRF_SAADC->SAMPLERATE = (80u << SAADC_SAMPLERATE_CC_Pos) | (SAADC_SAMPLERATE_MODE_Timers << SAADC_SAMPLERATE_MODE_Pos);
    NRF_SAADC->RESULT.MAXCNT = SMI_BLOCK;
    NRF_SAADC->RESULT.PTR = (uint32_t)buf[0];
    filling = 0;
    NRF_SAADC->EVENTS_STARTED = NRF_SAADC->EVENTS_END = NRF_SAADC->EVENTS_STOPPED = 0;
    NRF_SAADC->INTENSET = SAADC_INTENSET_STARTED_Msk | SAADC_INTENSET_END_Msk;
    NVIC_ClearPendingIRQ(SAADC_IRQn);
    NVIC_EnableIRQ(SAADC_IRQn);
    NRF_SAADC->TASKS_START = 1;
    NRF_SAADC->TASKS_SAMPLE = 1;               // starts the internal sample timer
}

void SAADC_IRQHandler(void) {
    if (NRF_SAADC->EVENTS_STARTED) {
        NRF_SAADC->EVENTS_STARTED = 0;
        NRF_SAADC->RESULT.PTR = (uint32_t)buf[filling ^ 1];   // queue the other buffer for the next START
    }
    if (NRF_SAADC->EVENTS_END) {
        NRF_SAADC->EVENTS_END = 0;
        int done = filling;
        filling ^= 1;
        if (running) NRF_SAADC->TASKS_START = 1;
        smi_block(&smi, buf[done], SMI_BLOCK);
        if (running && frames < CAP_MAX_FRAMES) {
            disp[frames] = (float)smi.fringes * SMI_HALF_LAMBDA_MM;
            frames = frames + 1;
            if (frame_cb) frame_cb(smi.fringes);
        }
    }
}

bool capture_start(uint16_t laser_code) {
    frames = 0;
    smi_init(&smi);
    pd_ua = laser_on(laser_code);
    if (pd_ua < 10.0f) { laser_off(); return false; }      // no light on the monitor photodiode
    running = true;
    saadc_continuous();
    return true;
}

int capture_stop(void) {
    running = false;
    NRF_SAADC->INTENCLR = 0xFFFFFFFFu;
    NVIC_DisableIRQ(SAADC_IRQn);
    NRF_SAADC->TASKS_STOP = 1;
    while (!NRF_SAADC->EVENTS_STOPPED) { }
    NRF_SAADC->EVENTS_STOPPED = NRF_SAADC->EVENTS_STARTED = NRF_SAADC->EVENTS_END = 0;
    NRF_SAADC->SAMPLERATE = 0;
    NRF_SAADC->ENABLE = 0;
    laser_off();
    return frames;
}

bool capture_running(void) { return running; }
int capture_frames(void) { return frames; }
const float *capture_disp_mm(void) { return disp; }
float capture_pd_ua(void) { return pd_ua; }
float capture_amplitude(void) { return smi_amplitude(&smi); }
