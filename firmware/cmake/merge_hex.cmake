# Merges two Intel HEX files that do not overlap (SoftDevice + application): A without its end-of-file record, then B.
#   cmake -DHEX_A=a.hex -DHEX_B=b.hex -DHEX_OUT=out.hex -P merge_hex.cmake
file(READ "${HEX_A}" TA)
file(READ "${HEX_B}" TB)
string(REPLACE "\r" "" TA "${TA}")
string(REPLACE "\r" "" TB "${TB}")
string(REPLACE ":00000001FF\n" "" TA "${TA}")
string(REPLACE ":00000001FF" "" TA "${TA}")
file(WRITE "${HEX_OUT}" "${TA}${TB}")
