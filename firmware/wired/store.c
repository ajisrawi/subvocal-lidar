// Training log in flash (see store.h). Written with the NVMC directly (no SoftDevice on the wired module).
#include "store.h"

#include <math.h>
#include <string.h>

#include "nrf.h"

#define STORE_BASE   0x60000u
#define STORE_SIZE   0x20000u
#define PAGE         4096u
#define MAGIC        0x5356u
enum { K_PHRASE = 1, K_TAKE = 2, K_DELETE = 3 };

typedef struct { uint16_t magic; uint8_t kind, slot; uint16_t len, zero; } rec_t;

dec_model_t g_model;
int8_t g_slot_of_phrase[DEC_MAX_PHRASES];
static const char *slot_text[STORE_SLOTS];
static uint8_t slot_text_len[STORE_SLOTS];
static uint32_t end_off;                     // first free byte of the log

static void nvmc_wait(void) { while (!NRF_NVMC->READY) { } }

static void flash_write(uint32_t addr, const void *data, uint32_t len) {   // addr word aligned; pads the tail with 0xFF
    const uint8_t *p = data;
    NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Wen; nvmc_wait();
    for (uint32_t o = 0; o < len; o += 4) {
        uint32_t w = 0xFFFFFFFFu;
        memcpy(&w, p + o, len - o >= 4 ? 4 : len - o);
        *(volatile uint32_t *)(addr + o) = w; nvmc_wait();
    }
    NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Ren; nvmc_wait();
}

static int append(uint8_t kind, uint8_t slot, const void *a, uint16_t alen, const void *b, uint16_t blen) {
    uint32_t total = sizeof(rec_t) + ((alen + blen + 3u) & ~3u);
    if (end_off + total > STORE_SIZE) return -1;
    rec_t r = { MAGIC, kind, slot, (uint16_t)(alen + blen), 0 };
    uint32_t at = STORE_BASE + end_off;
    flash_write(at, &r, sizeof r);
    if (alen) flash_write(at + sizeof r, a, alen);           // alen is a multiple of 4 whenever b follows
    if (blen) flash_write(at + sizeof r + alen, b, blen);
    end_off += total;
    return 0;
}

void store_load(void) {
    memset(&g_model, 0, sizeof g_model);
    g_model.typical = NAN;
    memset(slot_text, 0, sizeof slot_text);
    memset(slot_text_len, 0, sizeof slot_text_len);
    // per-slot takes, collected first, then packed into the model in slot order
    static const int16_t *take[STORE_SLOTS][DEC_MAX_TAKES];
    static uint16_t tframes[STORE_SLOTS][DEC_MAX_TAKES];
    static uint8_t ntake[STORE_SLOTS];
    memset(ntake, 0, sizeof ntake);
    uint32_t off = 0;
    while (off + sizeof(rec_t) <= STORE_SIZE) {
        const rec_t *r = (const rec_t *)(STORE_BASE + off);
        if (r->magic != MAGIC) break;
        const uint8_t *pl = (const uint8_t *)(r + 1);
        if (r->slot < STORE_SLOTS) {
            if (r->kind == K_PHRASE) { slot_text[r->slot] = (const char *)pl; slot_text_len[r->slot] = (uint8_t)(r->len > DEC_MAX_TEXT ? DEC_MAX_TEXT : r->len); }
            else if (r->kind == K_DELETE) { slot_text[r->slot] = 0; ntake[r->slot] = 0; }
            else if (r->kind == K_TAKE && r->len >= 4) {
                uint16_t fr = *(const uint16_t *)pl;
                int s = r->slot, n = ntake[s];
                if (n == DEC_MAX_TAKES) { memmove(&take[s][0], &take[s][1], sizeof take[s][0] * (DEC_MAX_TAKES - 1)); memmove(&tframes[s][0], &tframes[s][1], sizeof tframes[s][0] * (DEC_MAX_TAKES - 1)); n--; }
                take[s][n] = (const int16_t *)(pl + 4); tframes[s][n] = fr; ntake[s] = (uint8_t)(n + 1);
            }
        }
        off += sizeof(rec_t) + ((r->len + 3u) & ~3u);
    }
    end_off = off;
    for (int s = 0; s < STORE_SLOTS && g_model.nphrases < DEC_MAX_PHRASES; s++) {
        if (!ntake[s] || !slot_text[s]) continue;
        dec_phrase_t *ph = &g_model.phrase[g_model.nphrases];
        memcpy(ph->text, slot_text[s], slot_text_len[s]); ph->text[slot_text_len[s]] = 0;
        ph->ntakes = ntake[s];
        for (int t = 0; t < ntake[s]; t++) { ph->take[t] = take[s][t]; ph->frames[t] = tframes[s][t]; }
        g_slot_of_phrase[g_model.nphrases++] = (int8_t)s;
    }
    g_model.typical = dec_model_typical(&g_model);
}

int store_set_text(int slot, const char *text, int len) {
    if (slot < 0 || slot >= STORE_SLOTS || len <= 0 || len > DEC_MAX_TEXT) return -2;
    static uint8_t tmp[DEC_MAX_TEXT + 4];
    memcpy(tmp, text, (size_t)len);
    return append(K_PHRASE, (uint8_t)slot, tmp, (uint16_t)len, 0, 0);
}

int store_add_take(int slot, const int16_t *feat, int frames) {
    if (slot < 0 || slot >= STORE_SLOTS || frames <= 0 || frames > DEC_MAX_FEAT) return -2;
    uint16_t hdr[2] = { (uint16_t)frames, 0 };
    return append(K_TAKE, (uint8_t)slot, hdr, 4, feat, (uint16_t)(frames * 4));
}

int store_delete(int slot) { return slot < 0 || slot >= STORE_SLOTS ? -2 : append(K_DELETE, (uint8_t)slot, 0, 0, 0, 0); }

void store_clear(void) {
    for (uint32_t a = STORE_BASE; a < STORE_BASE + STORE_SIZE; a += PAGE) {
        if (*(const uint32_t *)a == 0xFFFFFFFFu && a > STORE_BASE + end_off) continue;   // already erased
        NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Een; nvmc_wait();
        NRF_NVMC->ERASEPAGE = a; nvmc_wait();
        NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Ren; nvmc_wait();
    }
    end_off = 0;
}

int store_free_bytes(void) { return (int)(STORE_SIZE - end_off); }
const char *store_text(int slot) { return slot >= 0 && slot < STORE_SLOTS && slot_text[slot] ? slot_text[slot] : ""; }
