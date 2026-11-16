# Bluetooth pod enclosure

Three printed parts; the pod slides onto the right temple of ordinary glasses (temple arms up to 3 mm thick and
6.6 mm tall) like a Google Glass pod. Closed size: 65.2 x 14.6 x 12.9 mm.

| Part | File |
|---|---|
| Back shell (board ledge, battery pocket, groove for the temple) | [`stl/subvocal-lidar-pod-back.stl`](stl/subvocal-lidar-pod-back.stl) |
| Cover (component side; print it in a translucent filament to see the LEDs) | [`stl/subvocal-lidar-pod-cover.stl`](stl/subvocal-lidar-pod-cover.stl) |
| Push-to-talk button cap | [`stl/subvocal-lidar-pod-button.stl`](stl/subvocal-lidar-pod-button.stl) |

- **Laser window:** the round 5.8 mm hole in the underside, below the board's notch. Leave it open (or fit a thin
  glass or polycarbonate window that passes 1550 nm; most clear plastics do).
- **Battery:** a 401030 LiPo lies in the pocket behind the board, wires round the board edge to the BT1 pads.
- **Fit:** glue the two shells or hold them with a strip of tape; a drop of silicone holds the pod on the temple.
- Print in PLA or PETG, 0.12-0.16 mm layers, the outer faces on the bed.

Model and renders: `render/make_renders.py` (Blender), output in [`renders/`](../../renders/).
