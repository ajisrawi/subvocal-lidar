# The 1550 nm laser

The sensor is a single 1550 nm laser diode that measures skin movement by **self-mixing interferometry**: a tiny
part of the light scattered back by the skin re-enters the laser and modulates its power. The laser's built-in
monitor photodiode sees one fringe for every 0.775 µm (half a wavelength) of movement along the beam. The firmware
counts those fringes, with their direction, 200 000 times a second and turns them into skin displacement.

JLCPCB does not stock 1550 nm lasers, so the laser is bought separately and soldered by hand (LD1).

## What to buy

| Property | Value |
|---|---|
| Type | **DFB** (distributed feedback) laser diode, single mode, 1550 nm (1530-1570 nm works) |
| Package | **TO-56** (5.6 mm) can, with **monitor photodiode** (back-facet PD) |
| Output power | 2-6 mW at 15-25 mA (the board limits the current to 23.4 mA) |
| Threshold current | 5-12 mA |
| Optics | Best: a version **with an aspheric lens cap** (often sold as "with lens" or "collimated"). Otherwise put a small aspheric lens (f ≈ 4-6 mm) in front of the window |
| Avoid | Fiber-pigtailed modules, isolator modules (an optical isolator blocks the self-mixing effect!), TEC/butterfly packages |

Search terms: "1550nm DFB laser diode TO56 with PD", "1550nm 2mW DFB TO-56 monitor photodiode". Typical price: $5-30.
Fabry-Perot (FP) lasers also show self-mixing, but DFB lasers give cleaner fringes.

## Pins

The board has four pads at the edge of the laser notch (Bluetooth pod) or corner cut-out (wired module):

| Pad | Signal | Connect |
|---|---|---|
| 1 | LD_K | laser **cathode** (−) |
| 2 | +3V3_A | laser **anode** (+) |
| 3 | +3V3_A | photodiode **cathode** |
| 4 | PD_A | photodiode **anode** |

- **4-pin lasers** (laser and photodiode isolated): connect all four as above.
- **3-pin "common case" lasers** where the laser anode and photodiode cathode share the case pin: case pin to pad 2
  (or 3), laser cathode to pad 1, photodiode anode to pad 4. This is the most common 1550 nm TO-56 wiring.
- Other 3-pin variants (common cathode) do not fit this circuit. Check the datasheet before ordering.

Cut the leads to about 2.5 mm and solder them flat on the pads, with the can's window pointing out of the notch.
The firmware refuses to run the laser when the photodiode reads less than 10 µA, so a reversed or dead laser is
reported as a laser fault (status bit / event), not driven harder.

## Eye safety

- 1550 nm light is absorbed in the front of the eye and does not reach the retina; the Class 1 limit at 1550 nm is
  about 10 mW, far above what this circuit can deliver.
- The current sink is limited **in hardware** to 23.4 mA (1.1 V across 47 Ω), whatever the firmware does. A typical
  DFB gives 3-5 mW at that current.
- The laser is powered only while the push-to-talk button is held (Bluetooth pod) or while the host has started a
  take (wired module), and its rail is switched off otherwise.
- The beam points down at the cheek, away from the eyes.
- This is an untested prototype: it has not been measured or certified. Measure the output power of your laser
  before wearing it.

## Aiming

The beam should land on the skin over the **masseter** (the jaw muscle in front of the ear, below the cheekbone),
20-40 mm from the window. That skin moves with every jaw and lip movement when you mouth words.

1. Fit the laser, power the device, start a take (hold the button, or `COMMAND = START` on the wired module).
2. Read the signal quality: fringe amplitude (`FRINGE_AMP` register, or the trainer app's take view). It should be
   well above 12 ADC codes while you move your jaw.
3. If the amplitude is low: adjust the angle of the laser (the pod's window is 5.8 mm wide), or the focus of the lens.
   Self-mixing works best with the spot focused on the skin.
4. If the fringes look noisy or jump: lower the laser current a little (`LASER_CODE`, default 2970 = 17 mA).
