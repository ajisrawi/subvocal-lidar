// Small bare-metal helpers for the nRF52832 (MDK registers only, no SDK drivers).
#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "nrf.h"

static inline void hw_dwt_init(void) {
    CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
    DWT->CYCCNT = 0;
    DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;
}
static inline void delay_us(uint32_t us) {
    uint32_t start = DWT->CYCCNT, n = us * (SystemCoreClock / 1000000u);
    while (DWT->CYCCNT - start < n) { }
}
static inline void delay_ms(uint32_t ms) { while (ms--) delay_us(1000); }

static inline void gpio_out(uint32_t pin, bool level) {
    if (level) NRF_P0->OUTSET = 1u << pin; else NRF_P0->OUTCLR = 1u << pin;
    NRF_P0->PIN_CNF[pin] = (GPIO_PIN_CNF_DIR_Output << GPIO_PIN_CNF_DIR_Pos) | (GPIO_PIN_CNF_INPUT_Disconnect << GPIO_PIN_CNF_INPUT_Pos);
}
static inline void gpio_set(uint32_t pin, bool level) { if (level) NRF_P0->OUTSET = 1u << pin; else NRF_P0->OUTCLR = 1u << pin; }
static inline void gpio_open_drain(uint32_t pin) {            // drive low or let go (pulled up outside)
    NRF_P0->OUTSET = 1u << pin;
    NRF_P0->PIN_CNF[pin] = (GPIO_PIN_CNF_DIR_Output << GPIO_PIN_CNF_DIR_Pos) | (GPIO_PIN_CNF_INPUT_Disconnect << GPIO_PIN_CNF_INPUT_Pos) |
                           (GPIO_PIN_CNF_DRIVE_S0D1 << GPIO_PIN_CNF_DRIVE_Pos);
}
static inline void gpio_input_pullup(uint32_t pin) {
    NRF_P0->PIN_CNF[pin] = (GPIO_PIN_CNF_DIR_Input << GPIO_PIN_CNF_DIR_Pos) | (GPIO_PIN_CNF_INPUT_Connect << GPIO_PIN_CNF_INPUT_Pos) |
                           (GPIO_PIN_CNF_PULL_Pullup << GPIO_PIN_CNF_PULL_Pos);
}
static inline bool gpio_read(uint32_t pin) { return (NRF_P0->IN >> pin) & 1u; }

uint32_t crc32_ieee(uint32_t crc, const uint8_t *p, uint32_t n);
