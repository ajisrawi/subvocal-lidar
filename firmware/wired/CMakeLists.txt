# Subvocal Lidar wired module firmware (nRF52832, bare metal: Nordic MDK headers + startup only, no SoftDevice).
#   cmake -G Ninja -B build -DCMAKE_TOOLCHAIN_FILE=../cmake/arm-gcc.cmake [-DNRF5_SDK=...]  &&  cmake --build build
cmake_minimum_required(VERSION 3.20)
project(subvocal_lidar_wired C ASM)

if(NOT NRF5_SDK)
  if(DEFINED ENV{NRF5_SDK})
    set(NRF5_SDK $ENV{NRF5_SDK})
  else()
    file(TO_CMAKE_PATH "$ENV{USERPROFILE}" HOME_DIR)
    set(NRF5_SDK "${HOME_DIR}/nordic/nRF5_SDK_17.1.0_ddde560")
  endif()
endif()
set(MDK ${NRF5_SDK}/modules/nrfx/mdk)
set(COMMON ${CMAKE_CURRENT_SOURCE_DIR}/../common)

add_executable(subvocal_lidar_wired
  main.c store.c
  ${COMMON}/capture.c ${COMMON}/laser.c ${COMMON}/smi.c ${COMMON}/decoder.c
  ${MDK}/system_nrf52.c ${MDK}/gcc_startup_nrf52.S)
set_target_properties(subvocal_lidar_wired PROPERTIES SUFFIX ".elf")
target_include_directories(subvocal_lidar_wired PRIVATE . ${COMMON} ${MDK} ${NRF5_SDK}/components/toolchain/cmsis/include)
set(CPU -mcpu=cortex-m4 -mthumb -mabi=aapcs -mfloat-abi=hard -mfpu=fpv4-sp-d16)
target_compile_definitions(subvocal_lidar_wired PRIVATE NRF52832_XXAA NRF52 FLOAT_ABI_HARD __STACK_SIZE=4096 __HEAP_SIZE=0 __STARTUP_CLEAR_BSS)
target_compile_options(subvocal_lidar_wired PRIVATE ${CPU} -Os -g3 -std=gnu11 -Wall -Wextra -Wno-unused-parameter -Wno-missing-field-initializers
  -ffunction-sections -fdata-sections -fno-strict-aliasing -fno-builtin -fshort-enums)
target_link_options(subvocal_lidar_wired PRIVATE ${CPU} -L${MDK} -T${CMAKE_CURRENT_SOURCE_DIR}/nrf52832_wired.ld
  -Wl,--gc-sections --specs=nano.specs -Wl,-Map=${CMAKE_BINARY_DIR}/subvocal_lidar_wired.map)
target_link_libraries(subvocal_lidar_wired PRIVATE m)

add_custom_command(TARGET subvocal_lidar_wired POST_BUILD
  COMMAND ${CMAKE_OBJCOPY} -O ihex $<TARGET_FILE:subvocal_lidar_wired> ${CMAKE_BINARY_DIR}/subvocal_lidar_wired.hex
  COMMAND ${CMAKE_SIZE} $<TARGET_FILE:subvocal_lidar_wired>)
