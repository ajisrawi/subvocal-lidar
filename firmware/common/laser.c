// Laser control. The DAC7311 sets the current sink (TLV9061 + MMBT3904 + 47 R); the hardware caps the current at
// 23.4 mA whatever the firmware does. +3V3_A powers the laser, DAC and op-amps and is off between takes.
// SPIM0 talks to the DAC (16-bit frames: 2 power-down bits, 12 data bits, 2 don't-care; SPI mode 1).
#include "laser.h"

#include "hw.h"
#include "pins.h"

static uint16_t cur_code;
static bool on;

static void dac_write(uint16_t code) {
    if (code > LASER_CODE_MAX) code = LASER_CODE_MAX;
    static uint8_t tx[2];
    uint16_t w = (uint16_t)(code << 2);                 // PD1 PD0 = 00: normal operation
    tx[0] = (uint8_t)(w >> 8); tx[1] = (uint8_t)w;
    gpio_set(PIN_DAC_SYNC, 0);
    NRF_SPIM0->TXD.PTR = (uint32_t)tx; NRF_SPIM0->TXD.MAXCNT = 2;
    NRF_SPIM0->RXD.PTR = 0; NRF_SPIM0->RXD.MAXCNT = 0;
    NRF_SPIM0->EVENTS_END = 0;
    NRF_SPIM0->TASKS_START = 1;
    while (!NRF_SPIM0->EVENTS_END) { }
    NRF_SPIM0->EVENTS_END = 0;
    gpio_set(PIN_DAC_SYNC, 1);
}

void laser_init(void) {
    gpio_out(PIN_ANA_EN, 0);
    gpio_out(PIN_DAC_SYNC, 1);
    gpio_out(PIN_DAC_SCLK, 0);
    gpio_out(PIN_DAC_DIN, 0);
    NRF_SPIM0->PSEL.SCK = PIN_DAC_SCLK;
    NRF_SPIM0->PSEL.MOSI = PIN_DAC_DIN;
    NRF_SPIM0->PSEL.MISO = 0xFFFFFFFFu;
    NRF_SPIM0->FREQUENCY = SPIM_FREQUENCY_FREQUENCY_M4;
    NRF_SPIM0->CONFIG = (SPIM_CONFIG_ORDER_MsbFirst << SPIM_CONFIG_ORDER_Pos) | (SPIM_CONFIG_CPHA_Trailing << SPIM_CONFIG_CPHA_Pos) |
                        (SPIM_CONFIG_CPOL_ActiveHigh << SPIM_CONFIG_CPOL_Pos);
    NRF_SPIM0->ENABLE = SPIM_ENABLE_ENABLE_Disabled;     // enabled only while the rail is on
    on = false;
    cur_code = 0;
}

static uint16_t adc_single(uint32_t ain) {
    static volatile int16_t v;
    NRF_SAADC->ENABLE = 1;
    NRF_SAADC->RESOLUTION = SAADC_RESOLUTION_VAL_12bit;
    NRF_SAADC->OVERSAMPLE = SAADC_OVERSAMPLE_OVERSAMPLE_Over8x;   // single reading: average 8
    NRF_SAADC->SAMPLERATE = SAADC_SAMPLERATE_MODE_Task << SAADC_SAMPLERATE_MODE_Pos;
    NRF_SAADC->CH[0].PSELP = ain;
    NRF_SAADC->CH[0].PSELN = SAADC_CH_PSELN_PSELN_NC;
    NRF_SAADC->CH[0].CONFIG = (SAADC_CH_CONFIG_GAIN_Gain1_4 << SAADC_CH_CONFIG_GAIN_Pos) | (SAADC_CH_CONFIG_REFSEL_VDD1_4 << SAADC_CH_CONFIG_REFSEL_Pos) |
                              (SAADC_CH_CONFIG_TACQ_10us << SAADC_CH_CONFIG_TACQ_Pos) | (SAADC_CH_CONFIG_BURST_Enabled << SAADC_CH_CONFIG_BURST_Pos);
    NRF_SAADC->RESULT.PTR = (uint32_t)&v; NRF_SAADC->RESULT.MAXCNT = 1;
    NRF_SAADC->EVENTS_STARTED = NRF_SAADC->EVENTS_END = NRF_SAADC->EVENTS_STOPPED = 0;
    NRF_SAADC->TASKS_START = 1;
    while (!NRF_SAADC->EVENTS_STARTED) { }
    NRF_SAADC->TASKS_SAMPLE = 1;
    while (!NRF_SAADC->EVENTS_END) { }
    NRF_SAADC->TASKS_STOP = 1;
    while (!NRF_SAADC->EVENTS_STOPPED) { }
    NRF_SAADC->EVENTS_STARTED = NRF_SAADC->EVENTS_END = NRF_SAADC->EVENTS_STOPPED = 0;
    NRF_SAADC->OVERSAMPLE = 0;
    return v < 0 ? 0 : (uint16_t)v;
}

uint16_t laser_adc_mv(uint32_t ain) { return (uint16_t)(adc_single(ain) * 3300u / 4096u); }

float laser_pd_ua(void) {
    float vout = adc_single(AIN_PD_DC) * 3.3f / 4096.0f;
    float ua = (VREF_HI_V - vout) / TIA_OHMS * 1e6f;
    return ua > 0 ? ua : 0;
}

void laser_set_code(uint16_t code) {
    if (code > LASER_CODE_MAX) code = LASER_CODE_MAX;
    cur_code = code;
    if (on) dac_write(code);
}

float laser_on(uint16_t code) {
    if (code > LASER_CODE_MAX) code = LASER_CODE_MAX;
    gpio_set(PIN_ANA_EN, 1);
    delay_ms(3);                                          // LDO soft start, op-amps settle
    gpio_set(PIN_DAC_SYNC, 1);
    NRF_SPIM0->ENABLE = SPIM_ENABLE_ENABLE_Enabled;
    dac_write(0);
    for (int k = 1; k <= 32; k++) { dac_write((uint16_t)((uint32_t)code * k / 32)); delay_us(150); }
    cur_code = code;
    on = true;
    delay_ms(2);                                          // set-point RC (1 ms) and photodiode settle
    return laser_pd_ua();
}

void laser_off(void) {
    if (on) for (int k = 7; k >= 0; k--) { dac_write((uint16_t)((uint32_t)cur_code * k / 8)); delay_us(100); }
    NRF_SPIM0->ENABLE = SPIM_ENABLE_ENABLE_Disabled;
    gpio_out(PIN_DAC_SCLK, 0); gpio_out(PIN_DAC_DIN, 0); gpio_out(PIN_DAC_SYNC, 0);   // no current into an unpowered DAC
    gpio_set(PIN_ANA_EN, 0);
    on = false;
}

bool laser_is_on(void) { return on; }
uint16_t laser_code(void) { return cur_code; }

uint32_t crc32_ieee(uint32_t crc, const uint8_t *p, uint32_t n) {
    crc = ~crc;
    while (n--) { crc ^= *p++; for (int k = 0; k < 8; k++) crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u))); }
    return ~crc;
}
