// On-module phrase training store: an append-only log in the last 128 KB of flash.
//   record = { u16 magic 'SV', u8 kind, u8 slot, u16 length, u16 0 } + payload, padded to 4 bytes
//   kind 1 PHRASE  payload = UTF-8 text of phrase slot `slot`
//   kind 2 TAKE    payload = u16 frames, u16 0, frames x { i16 displacement, i16 velocity } features (Q12)
//   kind 3 DELETE  phrase slot `slot` and its takes
// Features are read in place from flash (memory-mapped), so the model costs no RAM beyond its index.
#pragma once
#include <stdint.h>
#include "decoder.h"

#define STORE_SLOTS 64

extern dec_model_t g_model;
extern int8_t g_slot_of_phrase[DEC_MAX_PHRASES];      // model phrase index -> host slot number

void store_load(void);                                   // rebuilds g_model from the log
int store_set_text(int slot, const char *text, int len); // 0 ok, <0 error (full)
int store_add_take(int slot, const int16_t *feat, int frames);
int store_delete(int slot);
void store_clear(void);
int store_free_bytes(void);
const char *store_text(int slot);                        // "" if the slot has no text
