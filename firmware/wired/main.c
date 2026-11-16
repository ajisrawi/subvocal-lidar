// Subvocal Lidar WIRED module firmware (nRF52832, bare metal, no radio).
//
// The glasses' main processor talks to the module over I2C (address 0x2C, at the host's own I/O voltage through the
// TCA9406) and gets an interrupt on HOST_IRQ (open drain, low = attention). Typical use:
//   user touches the frame  -> host writes COMMAND = START     (laser on, skin motion recorded, 200 frames/s)
//   user lets go            -> host writes COMMAND = STOP      (laser off, phrase recognised on the module)
//   module pulls IRQ low    -> host reads STATUS, RESULT and PHRASE_TEXT, and types / sends the text
// Training happens on the module: host writes PHRASE_TEXT for a slot, then records takes with COMMAND = STOP_TRAIN.
// Register map: firmware/README.md.
#include <math.h>
#include <string.h>

#include "capture.h"
#include "decoder.h"
#include "hw.h"
#include "laser.h"
#include "pins.h"
#include "store.h"

#define I2C_ADDR        0x2C
#define PIN_HOST_IRQ    25    // P0.25
#define PIN_I2C_SDA     26    // P0.26
#define PIN_I2C_SCL     27    // P0.27
#define FW_VERSION      0x10  // 1.0

enum { R_WHO = 0x00, R_VER = 0x01, R_STATUS = 0x02, R_CMD = 0x03, R_LASER = 0x04, R_PD = 0x06, R_AMP = 0x08, R_FRAMES = 0x0A,
       R_RESULT = 0x0C, R_SENS = 0x12, R_PHRASES = 0x14, R_FREE = 0x15, R_TRAIN = 0x20, R_TEXT = 0x21, R_FIFO = 0x40 };
enum { C_START = 0x01, C_STOP = 0x02, C_DISCARD = 0x03, C_STOP_TRAIN = 0x04, C_CLEAR = 0x10, C_DELETE = 0x11, C_RESET = 0xA5 };
enum { S_SENSING = 1, S_RESULT = 2, S_LASER_FAULT = 4, S_NO_FRINGES = 8, S_BUSY = 16, S_TRAIN_DONE = 32, S_FIFO = 64, S_TRAIN_FAIL = 128 };

static volatile uint8_t status;
static volatile uint8_t pending_cmd;
static uint16_t laser_code_reg = LASER_CODE_DEFAULT;
static uint16_t sens_milli = 1800;
static uint8_t train_slot;
static volatile uint8_t text_pending_len;
static uint8_t text_pending[DEC_MAX_TEXT + 1];
static dec_result_t result = { .phrase = -1, .best = -1 };
static int8_t result_slot = -1, result_best_slot = -1;

// ---------------------------------------------------------------- 200 Hz displacement FIFO for the host
#define FIFO_N 256
static int16_t fifo[FIFO_N];
static volatile uint16_t fifo_w, fifo_r;

static void irq_update(void) {
    bool want = (status & (S_RESULT | S_TRAIN_DONE | S_TRAIN_FAIL)) || (uint16_t)(fifo_w - fifo_r) >= 30;
    gpio_set(PIN_HOST_IRQ, !want);                  // open drain: 0 pulls the line low
}

static void on_frame(int32_t fringes) {             // ADC interrupt, every 5 ms while sensing
    if ((uint16_t)(fifo_w - fifo_r) < FIFO_N) { fifo[fifo_w % FIFO_N] = (int16_t)fringes; fifo_w++; }
    irq_update();
}

// ---------------------------------------------------------------- I2C target (TWIS1)
static uint8_t rx[80], tx[128];
static uint8_t reg_ptr;

static void put16(uint8_t *p, uint16_t v) { p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); }

static uint32_t build_tx(uint8_t reg) {             // registers read back from reg onwards
    memset(tx, 0, sizeof tx);
    switch (reg) {
        case R_FIFO: {
            uint16_t n = (uint16_t)(fifo_w - fifo_r);
            if (n > 60) n = 60;
            tx[0] = (uint8_t)n;
            for (int k = 0; k < n; k++) put16(tx + 1 + 2 * k, (uint16_t)fifo[(fifo_r + k) % FIFO_N]);
            fifo_r = (uint16_t)(fifo_r + n);
            irq_update();
            return 1 + 2u * n;
        }
        case R_TEXT: {
            const char *t = result_slot >= 0 ? store_text(result_slot) : (result_best_slot >= 0 ? store_text(result_best_slot) : "");
            size_t n = strnlen(t, DEC_MAX_TEXT);
            memcpy(tx, t, n);
            return (uint32_t)n + 1;
        }
        default: break;
    }
    // plain register file 0x00-0x1F
    uint8_t f[32] = { 0 };
    f[R_WHO] = 0x5C; f[R_VER] = FW_VERSION; f[R_STATUS] = status;
    put16(f + R_LASER, laser_code_reg);
    put16(f + R_PD, (uint16_t)capture_pd_ua());
    put16(f + R_AMP, (uint16_t)capture_amplitude());
    put16(f + R_FRAMES, (uint16_t)capture_frames());
    f[R_RESULT] = (uint8_t)result_slot; f[R_RESULT + 1] = (uint8_t)result_best_slot;
    put16(f + R_RESULT + 2, isfinite(result.distance) ? (uint16_t)fminf(result.distance * 1000.0f, 65535.0f) : 0xFFFF);
    put16(f + R_RESULT + 4, isfinite(result.threshold) ? (uint16_t)fminf(result.threshold * 1000.0f, 65535.0f) : 0xFFFF);
    put16(f + R_SENS, sens_milli);
    f[R_PHRASES] = (uint8_t)g_model.nphrases;
    f[R_FREE] = (uint8_t)(store_free_bytes() / 1024);
    if (reg < 32) { memcpy(tx, f + reg, 32u - reg); }
    if (reg == R_STATUS || reg == R_WHO) { status &= (uint8_t)~(S_TRAIN_DONE | S_TRAIN_FAIL); }   // reading status acknowledges
    if (reg <= R_RESULT + 5 && reg + 32 > R_RESULT) status &= (uint8_t)~S_RESULT;
    irq_update();
    return 32;
}

static void reg_write(uint8_t reg, const uint8_t *d, uint32_t n) {
    switch (reg) {
        case R_CMD: if (n >= 1) pending_cmd = d[0]; break;
        case R_LASER: if (n >= 2) { laser_code_reg = (uint16_t)(d[0] | d[1] << 8); if (laser_code_reg > LASER_CODE_MAX) laser_code_reg = LASER_CODE_MAX; } break;
        case R_SENS: if (n >= 2) { uint16_t v = (uint16_t)(d[0] | d[1] << 8); if (v >= 500 && v <= 8000) sens_milli = v; } break;
        case R_TRAIN: if (n >= 1 && d[0] < STORE_SLOTS) train_slot = d[0]; break;
        case R_TEXT:      // slot, text
            if (n >= 2 && d[0] < STORE_SLOTS) { train_slot = d[0]; text_pending_len = (uint8_t)(n - 1 > DEC_MAX_TEXT ? DEC_MAX_TEXT : n - 1); memcpy(text_pending, d + 1, text_pending_len); }
            break;
        default: break;
    }
}

void SPIM1_SPIS1_TWIM1_TWIS1_SPI1_TWI1_IRQHandler(void) {
    if (NRF_TWIS1->EVENTS_WRITE) {
        NRF_TWIS1->EVENTS_WRITE = 0;
        NRF_TWIS1->RXD.PTR = (uint32_t)rx; NRF_TWIS1->RXD.MAXCNT = sizeof rx;
        NRF_TWIS1->TASKS_PREPARERX = 1;
        NRF_TWIS1->TASKS_RESUME = 1;
    }
    if (NRF_TWIS1->EVENTS_READ) {
        NRF_TWIS1->EVENTS_READ = 0;
        uint32_t n = build_tx(reg_ptr);
        NRF_TWIS1->TXD.PTR = (uint32_t)tx; NRF_TWIS1->TXD.MAXCNT = n;
        NRF_TWIS1->TASKS_PREPARETX = 1;
        NRF_TWIS1->TASKS_RESUME = 1;
    }
    if (NRF_TWIS1->EVENTS_STOPPED) {
        NRF_TWIS1->EVENTS_STOPPED = 0;
        uint32_t n = NRF_TWIS1->RXD.AMOUNT;
        if (n >= 1) { reg_ptr = rx[0]; if (n > 1) reg_write(rx[0], rx + 1, n - 1); }
        NRF_TWIS1->RXD.MAXCNT = 0;
    }
    if (NRF_TWIS1->EVENTS_ERROR) { NRF_TWIS1->EVENTS_ERROR = 0; NRF_TWIS1->ERRORSRC = NRF_TWIS1->ERRORSRC; }
}

static void host_init(void) {
    gpio_open_drain(PIN_HOST_IRQ);
    NRF_P0->PIN_CNF[PIN_I2C_SDA] = (GPIO_PIN_CNF_INPUT_Connect << GPIO_PIN_CNF_INPUT_Pos) | (GPIO_PIN_CNF_DRIVE_S0D1 << GPIO_PIN_CNF_DRIVE_Pos);
    NRF_P0->PIN_CNF[PIN_I2C_SCL] = (GPIO_PIN_CNF_INPUT_Connect << GPIO_PIN_CNF_INPUT_Pos) | (GPIO_PIN_CNF_DRIVE_S0D1 << GPIO_PIN_CNF_DRIVE_Pos);
    NRF_TWIS1->PSEL.SDA = PIN_I2C_SDA;
    NRF_TWIS1->PSEL.SCL = PIN_I2C_SCL;
    NRF_TWIS1->ADDRESS[0] = I2C_ADDR;
    NRF_TWIS1->CONFIG = TWIS_CONFIG_ADDRESS0_Msk;
    NRF_TWIS1->ORC = 0xFF;
    NRF_TWIS1->SHORTS = TWIS_SHORTS_WRITE_SUSPEND_Msk | TWIS_SHORTS_READ_SUSPEND_Msk;
    NRF_TWIS1->INTENSET = TWIS_INTENSET_WRITE_Msk | TWIS_INTENSET_READ_Msk | TWIS_INTENSET_STOPPED_Msk | TWIS_INTENSET_ERROR_Msk;
    NVIC_SetPriority(SPIM1_SPIS1_TWIM1_TWIS1_SPI1_TWI1_IRQn, CAP_IRQ_PRIORITY);
    NVIC_EnableIRQ(SPIM1_SPIS1_TWIM1_TWIS1_SPI1_TWI1_IRQn);
    NRF_TWIS1->ENABLE = TWIS_ENABLE_ENABLE_Enabled;
}

// ---------------------------------------------------------------- takes
static int16_t feat[2 * DEC_MAX_FEAT];

static void start_take(void) {
    if (capture_running()) return;
    fifo_r = fifo_w = 0;
    status &= (uint8_t)~(S_RESULT | S_LASER_FAULT | S_NO_FRINGES);
    if (!capture_start(laser_code_reg)) { status |= S_LASER_FAULT; irq_update(); return; }
    status |= S_SENSING;
}

static void finish_take(uint8_t how) {
    if (!capture_running()) return;
    float amp = capture_amplitude();
    int n = capture_stop();
    status &= (uint8_t)~S_SENSING;
    if (amp < 12.0f) status |= S_NO_FRINGES;
    if (how == C_DISCARD) { irq_update(); return; }
    int nf = dec_features_disp(capture_disp_mm(), n, feat, DEC_MAX_FEAT);
    if (how == C_STOP_TRAIN) {
        status |= S_BUSY;
        int st = nf > 0 ? store_add_take(train_slot, feat, nf) : -3;
        if (st == 0) store_load();
        status &= (uint8_t)~S_BUSY;
        status |= st == 0 ? S_TRAIN_DONE : S_TRAIN_FAIL;
    } else {
        result = dec_recognize(&g_model, feat, nf, sens_milli / 1000.0f);
        result_slot = result.phrase >= 0 ? g_slot_of_phrase[result.phrase] : -1;
        result_best_slot = result.best >= 0 ? g_slot_of_phrase[result.best] : -1;
        status |= S_RESULT;
    }
    irq_update();
}

int main(void) {
    hw_dwt_init();
    NRF_POWER->DCDCEN = 0;                          // LDO mode (no DC/DC inductors on the board)
    capture_init(on_frame);
    store_load();
    host_init();
    irq_update();
    for (;;) {
        uint8_t c = pending_cmd;
        if (c) {
            pending_cmd = 0;
            switch (c) {
                case C_START: start_take(); break;
                case C_STOP: case C_DISCARD: case C_STOP_TRAIN: finish_take(c); break;
                case C_CLEAR: status |= S_BUSY; store_clear(); store_load(); status &= (uint8_t)~S_BUSY; break;
                case C_DELETE: status |= S_BUSY; store_delete(train_slot); store_load(); status &= (uint8_t)~S_BUSY; break;
                case C_RESET: NVIC_SystemReset(); break;
                default: break;
            }
        }
        if (text_pending_len) {
            status |= S_BUSY;
            store_set_text(train_slot, (const char *)text_pending, text_pending_len);
            text_pending_len = 0;
            store_load();
            status &= (uint8_t)~S_BUSY;
        }
        if (capture_running() && capture_frames() >= CAP_MAX_FRAMES) finish_take(C_STOP);   // 3 s limit
        __WFE();
    }
}
