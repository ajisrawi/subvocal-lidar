"""Generates firmware/bluetooth/main.c from Nordic's nRF5 SDK 17.1 HID keyboard example (ble_app_hids_keyboard).

Keeps the example's Bluetooth plumbing verbatim (peer manager, advertising, GAP/GATT, HID, battery and device information
services, connection parameters) and replaces the demo parts (simulated battery, dev-kit buttons and LEDs, demo key
sequences) with subvocal_app.c. The Nordic licence header of the example stays at the top of main.c.
    python firmware/bluetooth/gen_main.py [path-to-nRF5_SDK_17.1.0]
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SDK = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser('~'), 'nordic', 'nRF5_SDK_17.1.0_ddde560')
src = open(os.path.join(SDK, 'examples', 'ble_peripheral', 'ble_app_hids_keyboard', 'main.c'), encoding='utf-8').read()
lines = src.split('\n')

def func(name):
    m = re.search(r'\n((?:static )?[a-z_0-9]+ \*?\s*%s\s*\([^)]*\)\s*\n\{)' % re.escape(name), src)
    assert m, name
    i = m.start(1)
    depth = 0
    for j in range(src.index('{', i), len(src)):
        if src[j] == '{': depth += 1
        elif src[j] == '}':
            depth -= 1
            if depth == 0: return src[i:j + 1]
    raise ValueError(name)

def no_bsp(code):
    out, skip_check = [], False
    for l in code.split('\n'):
        if 'bsp_' in l: skip_check = True; continue
        if skip_check and l.strip() == 'APP_ERROR_CHECK(err_code);': skip_check = False; continue
        skip_check = False
        out.append(l)
    return '\n'.join(out)

licence_end = src.index('*/') + 2
licence = src[:licence_end]

head = [l for l in lines[55:90] if 'sensorsim' not in l and 'bsp_btn_ble' not in l]
defines = []
for l in lines[91:166]:
    if 'SHIFT_BUTTON_ID' in l: continue
    l = l.replace('"Nordic_Keyboard"', '"Subvocal Lidar"').replace('"NordicSemiconductor"', '"SubvocalLidar"')
    l = re.sub(r'(#define PNP_ID_VENDOR_ID\s+)0x1915', r'\g<1>0x1209', l)
    l = re.sub(r'(#define PNP_ID_PRODUCT_ID\s+)0xEEEE', r'\g<1>0x0002', l)
    l = re.sub(r'(#define APP_ADV_SLOW_DURATION\s+)18000', r'\g<1>30000', l)   # 5 min slow advertising, then sleep
    defines.append(l)
globals_ = []
in_globals = False
for l in lines[218:239]:
    if any(k in l for k in ('sensorsim', 'buffer_list', 'm_caps_on')): continue
    globals_.append(l)

keep = ['assert_nrf_callback', 'whitelist_set', 'identities_set', 'delete_bonds', 'advertising_start', 'pm_evt_handler',
        'service_error_handler', 'ble_advertising_error_handler', 'gap_params_init', 'gatt_init', 'nrf_qwr_error_handler',
        'qwr_init', 'dis_init', 'bas_init', 'hids_init', 'conn_params_error_handler', 'conn_params_init', 'on_hids_evt',
        'ble_stack_init', 'scheduler_init', 'peer_manager_init', 'log_init', 'power_management_init', 'idle_state_handle']
body = []
for name in keep:
    f = func(name)
    if name == 'on_hids_evt':
        f = f.replace('on_hid_rep_char_write(p_evt);', '// Caps Lock and other output reports: not used').replace(
            'case BLE_HIDS_EVT_NOTIF_ENABLED:\n            break;', 'case BLE_HIDS_EVT_NOTIF_ENABLED:\n            m_kb_notify = true;\n            break;')
    body.append(f)

# advertising events: example minus the dev-kit LED indications; idle -> System OFF until the button is pressed
adv = no_bsp(func('on_adv_evt')).replace('sleep_mode_enter();', 'subvocal_sleep();')
ble_evt = no_bsp(func('ble_evt_handler'))
ble_evt = ble_evt.replace('            // Dequeue all keys without transmission.\n            (void) buffer_dequeue(false);\n', '')
ble_evt = re.sub(r'\n\s*// Reset m_caps_on variable.*?m_caps_on = false;\n\s*// disabling alert 3.*?\n', '\n', ble_evt, flags=re.S)
ble_evt = ble_evt.replace('            // Send next key event\n            (void) buffer_dequeue(true);\n', '            // a transmit buffer is free again (key_report / sv_send retry)\n')

adv_init = func('advertising_init')
adv_init = adv_init.replace('    init.evt_handler   = on_adv_evt;',
    '    // scan response: the Subvocal service UUID, so the trainer apps find the pod\n'
    '    static ble_uuid_t sv_uuid;\n    sv_uuid.uuid = 0x0000; sv_uuid.type = m_sv_uuid_type;\n'
    '    init.srdata.uuids_more_available.uuid_cnt = 1;\n    init.srdata.uuids_more_available.p_uuids  = &sv_uuid;\n\n'
    '    init.evt_handler   = on_adv_evt;')

timers = '''static void battery_level_meas_timeout_handler(void * p_context)
{
    UNUSED_PARAMETER(p_context);
    uint16_t mv = vbat_mv();
    if (mv == 0) return;                                  // busy sampling the laser
    ret_code_t err_code = ble_bas_battery_level_update(&m_bas, vbat_percent(mv), BLE_CONN_HANDLE_ALL);
    if ((err_code != NRF_SUCCESS) && (err_code != NRF_ERROR_BUSY) && (err_code != NRF_ERROR_RESOURCES) &&
        (err_code != NRF_ERROR_FORBIDDEN) && (err_code != NRF_ERROR_INVALID_STATE) &&
        (err_code != BLE_ERROR_GATTS_SYS_ATTR_MISSING))
    {
        APP_ERROR_HANDLER(err_code);
    }
}

static void timers_init(void)
{
    APP_ERROR_CHECK(app_timer_init());
    APP_ERROR_CHECK(app_timer_create(&m_battery_timer_id, APP_TIMER_MODE_REPEATED, battery_level_meas_timeout_handler));
}

static void services_init(void)
{
    qwr_init();
    dis_init();
    bas_init();
    hids_init();
    sv_init();
}
'''

main = '''int main(void)
{
    log_init();
    timers_init();
    power_management_init();
    ble_stack_init();
    scheduler_init();
    gap_params_init();
    gatt_init();
    services_init();
    advertising_init();
    conn_params_init();
    peer_manager_init();
    subvocal_init();

    APP_ERROR_CHECK(app_timer_start(m_battery_timer_id, APP_TIMER_TICKS(30000), NULL));
    advertising_start(false);

    for (;;)
    {
        subvocal_poll();
        idle_state_handle();
    }
}
'''

out = [licence, '',
       '/* Subvocal Lidar Bluetooth pod firmware. GENERATED by gen_main.py from the nRF5 SDK 17.1 example',
       ' * ble_app_hids_keyboard (Nordic licence above); the Subvocal parts are in subvocal_app.c. */', '']
out += head + ['#include "nrf_delay.h"', ''] + defines + [''] + globals_ + ['']
out += ['static void on_hids_evt(ble_hids_t * p_hids, ble_hids_evt_t * p_evt);', 'static void idle_state_handle(void);',
        'static void ble_evt_handler(ble_evt_t const * p_ble_evt, void * p_context);', 'static void on_adv_evt(ble_adv_evt_t ble_adv_evt);',
        'static volatile bool m_sv_notify, m_kb_notify;', 'static uint8_t m_sv_uuid_type;',
        'static void subvocal_sleep(void);', 'static void sv_init(void);', '']
out += ['#include "subvocal_app.c"', '']
out += body + [adv, ble_evt, adv_init, timers, main]
text = '\n\n'.join(out) + '\n'
open(os.path.join(HERE, 'main.c'), 'w', encoding='utf-8', newline='\n').write(text)
print('main.c', len(text.split('\n')), 'lines')
