// Text -> HID keyboard reports (US layout). The host's keyboard layout must be English (US) for symbols to come out
// right; letters, digits and space work on most Latin layouts. Characters outside ASCII are skipped.
#pragma once
#include <stdbool.h>
#include <stdint.h>

// Fills mod/key for one ASCII character; false if it has no key on a US keyboard.
bool kb_ascii_to_key(char c, uint8_t *mod, uint8_t *key);
