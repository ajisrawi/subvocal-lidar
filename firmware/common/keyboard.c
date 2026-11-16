// ASCII -> USB HID usage IDs (keyboard page 0x07), US layout.
#include "keyboard.h"

#define SHIFT 0x02   // left shift modifier bit

bool kb_ascii_to_key(char c, uint8_t *mod, uint8_t *key) {
    *mod = 0;
    if (c >= 'a' && c <= 'z') { *key = (uint8_t)(0x04 + (c - 'a')); return true; }
    if (c >= 'A' && c <= 'Z') { *mod = SHIFT; *key = (uint8_t)(0x04 + (c - 'A')); return true; }
    if (c >= '1' && c <= '9') { *key = (uint8_t)(0x1E + (c - '1')); return true; }
    if (c == '0') { *key = 0x27; return true; }
    static const struct { char c; uint8_t key, shift; } tab[] = {
        { ' ', 0x2C, 0 }, { '\n', 0x28, 0 }, { '\t', 0x2B, 0 },
        { '-', 0x2D, 0 }, { '_', 0x2D, 1 }, { '=', 0x2E, 0 }, { '+', 0x2E, 1 },
        { '[', 0x2F, 0 }, { '{', 0x2F, 1 }, { ']', 0x30, 0 }, { '}', 0x30, 1 },
        { '\\', 0x31, 0 }, { '|', 0x31, 1 }, { ';', 0x33, 0 }, { ':', 0x33, 1 },
        { '\'', 0x34, 0 }, { '"', 0x34, 1 }, { '`', 0x35, 0 }, { '~', 0x35, 1 },
        { ',', 0x36, 0 }, { '<', 0x36, 1 }, { '.', 0x37, 0 }, { '>', 0x37, 1 },
        { '/', 0x38, 0 }, { '?', 0x38, 1 },
        { '!', 0x1E, 1 }, { '@', 0x1F, 1 }, { '#', 0x20, 1 }, { '$', 0x21, 1 }, { '%', 0x22, 1 },
        { '^', 0x23, 1 }, { '&', 0x24, 1 }, { '*', 0x25, 1 }, { '(', 0x26, 1 }, { ')', 0x27, 1 },
    };
    for (unsigned k = 0; k < sizeof tab / sizeof tab[0]; k++)
        if (tab[k].c == c) { *key = tab[k].key; *mod = tab[k].shift ? SHIFT : 0; return true; }
    return false;
}
