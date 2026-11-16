# Subvocal Lidar Bluetooth pod firmware (nRF52832 + SoftDevice S132 7.2, nRF5 SDK 17.1).
#   cmake -G Ninja -B build -DCMAKE_TOOLCHAIN_FILE=../cmake/arm-gcc.cmake [-DNRF5_SDK=...]  &&  cmake --build build
# Output: build/subvocal_lidar_bt.hex (application) and build/subvocal_lidar_bt_full.hex (SoftDevice + application).
cmake_minimum_required(VERSION 3.20)
project(subvocal_lidar_bt C ASM)

if(NOT NRF5_SDK)
  if(DEFINED ENV{NRF5_SDK})
    set(NRF5_SDK $ENV{NRF5_SDK})
  else()
    file(TO_CMAKE_PATH "$ENV{USERPROFILE}" HOME_DIR)
    set(NRF5_SDK "${HOME_DIR}/nordic/nRF5_SDK_17.1.0_ddde560")
  endif()
endif()
set(COMMON ${CMAKE_CURRENT_SOURCE_DIR}/../common)
include(${CMAKE_CURRENT_SOURCE_DIR}/sdk_files.cmake)

add_executable(subvocal_lidar_bt main.c
  ${COMMON}/capture.c ${COMMON}/laser.c ${COMMON}/smi.c ${COMMON}/decoder.c ${COMMON}/keyboard.c
  ${SDK_SOURCES})
set_target_properties(subvocal_lidar_bt PROPERTIES SUFFIX ".elf")
target_include_directories(subvocal_lidar_bt PRIVATE . config ${COMMON} ${SDK_INCLUDES})
set(CPU -mcpu=cortex-m4 -mthumb -mabi=aapcs -mfloat-abi=hard -mfpu=fpv4-sp-d16)
set(DEFS APP_TIMER_V2 APP_TIMER_V2_RTC1_ENABLED CONFIG_GPIO_AS_PINRESET FLOAT_ABI_HARD NRF52 NRF52832_XXAA NRF52_PAN_74
  NRF_SD_BLE_API_VERSION=7 S132 SOFTDEVICE_PRESENT __HEAP_SIZE=0 __STACK_SIZE=4096 __STARTUP_CLEAR_BSS)
target_compile_definitions(subvocal_lidar_bt PRIVATE ${DEFS})
target_compile_options(subvocal_lidar_bt PRIVATE ${CPU} -Os -g3 -std=gnu11 -Wall
  -ffunction-sections -fdata-sections -fno-strict-aliasing -fno-builtin -fshort-enums
  $<$<COMPILE_LANGUAGE:C>:-Wno-unused-function>)
target_link_options(subvocal_lidar_bt PRIVATE ${CPU} -L${NRF5_SDK}/modules/nrfx/mdk -T${CMAKE_CURRENT_SOURCE_DIR}/subvocal_lidar_bt.ld
  -Wl,--gc-sections --specs=nano.specs -Wl,-Map=${CMAKE_BINARY_DIR}/subvocal_lidar_bt.map)
target_link_libraries(subvocal_lidar_bt PRIVATE m c nosys)

set(SD_HEX ${NRF5_SDK}/components/softdevice/s132/hex/s132_nrf52_7.2.0_softdevice.hex)
add_custom_command(TARGET subvocal_lidar_bt POST_BUILD
  COMMAND ${CMAKE_OBJCOPY} -O ihex $<TARGET_FILE:subvocal_lidar_bt> ${CMAKE_BINARY_DIR}/subvocal_lidar_bt.hex
  COMMAND ${CMAKE_COMMAND} -DHEX_A=${SD_HEX} -DHEX_B=${CMAKE_BINARY_DIR}/subvocal_lidar_bt.hex -DHEX_OUT=${CMAKE_BINARY_DIR}/subvocal_lidar_bt_full.hex
          -P ${CMAKE_CURRENT_SOURCE_DIR}/../cmake/merge_hex.cmake
  COMMAND ${CMAKE_SIZE} $<TARGET_FILE:subvocal_lidar_bt>)
