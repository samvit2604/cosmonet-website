# Recruitment hero motion reference

Source: `WhatsApp Video 2026-11-08 at 10.28.35.mp4`, 7.93 seconds, 1280 × 720, 24 fps, 190 decoded frames. All frames were inspected in timestamped contact sheets, with full-resolution checks at quarter-second intervals. The source ends during an active movement cycle.

The camera and three platforms remain fixed. The six-person candidate queue, central assessment cards and interviewer desk form separate groups. Card travel, magnifier scanning, approval feedback and lighting use independent timing.

| Source time | Magnifier and main card | Side cards and people | Approval and light |
| --- | --- | --- | --- |
| 0–1 s | Lens holds high through about 0.6 s, then descends. Main card first drops slightly, then rises. | Four candidates become six as two rear figures emerge around 0.2–0.7 s. Left and right cards move upward. Recruiter's hand follows the handle; body stays almost fixed. | Initial check fades by about 0.15 s; its panel stays blank until the tick starts drawing near 1 s. Pink rim bloom fades; a small floor halo and white rising arc develop. |
| 1–2 s | Lens scans down from portrait to stars, reaching its lowest point around 1.7 s. The main card rises, opposing the lens motion. Handle becomes more horizontal. | Side cards continue upward at different phases. Six candidates hold position. | Tick completes around 1.15 s. Floor halo expands and brightens; small sparkles and white streaks appear. |
| 2–3 s | Lens returns toward the portrait while the main card descends. | Right card fades at the top and its replacement enters from below around 2.5–2.9 s. Left replacement starts entering around 2.8 s. Outgoing and incoming cards overlap. | Check panel flares white/pink from about 2.6 s. Existing floor halo fades; another white arc rises behind the card. |
| 3–4 s | Lens holds high, then moves slightly higher. Main card settles lower. | Left outgoing card fades while its replacement rises. Right replacement continues upward. | Approval flare resolves to a clear tick around 3.3 s. Pink card rim blooms again; a new floor halo expands. |
| 4–5 s | Lens descends from its highest position toward the stars. Main card rises again. | Both card columns continue their upward conveyor movement. Recruiter's forearm changes angle with the lens. | Tick initially holds, then a second flare grows late in the interval. The floor halo reaches a broad bright phase. |
| 5–6 s | Lens reaches a low point around 5.1 s, then returns high by 6 s. Main card descends. | Side profiles rise independently; cards approaching the top fade. | Flare resolves into a blank magenta panel around 5.3 s; the tick draws back around 5.85–6.1 s. Floor glow fades and restarts. |
| 6–7 s | Lens briefly holds near the portrait, then scans downward again. Main card rises toward the end of the interval. | Side columns pass through another fade-and-wrap transition with visible overlap. | Tick remains visible. White arcs, expanding floor glow and pink rim light continue on separate phases. |
| 7–7.93 s | Lens reverses near 7 s and rises. Main card remains in its ongoing bobbing cycle. | Replacement cards continue rising; all six candidates stay assembled. | Tick stays clear; halo and rim glow continue. The final frame does not match the opening pose. |

## Implementation

The hero uses native Three.js geometry, matching the MVP/cloud rendering approach. It recreates the reference composition and motion; the procedural geometry is not a pixel-identical copy of the source artwork.

`recruitment/motion.js` contains 190-frame tracking samples for lens X, main-card height and approval brightness. Lens Y uses manually verified quarter-second keys with interpolation because the rim becomes partly occluded during the scan. The first 7.93 seconds follow the observed sequence. A 1.67-second continuation returns the scene gently to its opening state, producing a 9.6-second loop.

The recruitment page retains its light background and Cosmonet's magenta, violet and blue accents. A poster provides the fallback when WebGL is unavailable. Reduced-motion preference displays a still scene; the pause control stops playback, and animation also stops when the hero is offscreen or the page is hidden.
