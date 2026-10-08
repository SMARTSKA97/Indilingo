# Animation spike: Lottie vs Rive

Status: decision proposed, to be confirmed with a prototype in P1.

## What we need

- Tigris plus 3 animal and 6 human characters, each with states such as idle, talking (mouth synced to audio), cheer, sad and a few lesson-specific poses.
- Runs on web and in the Capacitor Android WebView, on low-end phones.
- Honors the learner's reduce-motion choice (render a still frame).
- Small download. Tamil learners are often on limited data.
- One artist or one solo developer can produce and maintain it.

## Comparison

| | Lottie (lottie-web / dotLottie) | Rive |
|---|---|---|
| Authoring | After Effects plus Bodymovin export, or LottieFiles tools | Rive editor (free tier available) |
| Interactivity | Play, pause, seek by frame. State logic lives in our code | State machines built in. Inputs (for example `talking`, `cheer`) switch states smoothly |
| Lip sync | Needs separate mouth clips swapped by code | One boolean or number input drives the mouth |
| File size | JSON, often 50-300 KB per character. dotLottie compresses well | Binary `.riv`, usually 10-80 KB per character |
| Runtime cost | SVG or canvas, can be heavy on low-end devices | Canvas or WebGL, lighter for vector characters |
| Angular and Capacitor | Works. Mature | Works through `@rive-app/canvas`. Mature |
| Free assets | Large library | Smaller library, but characters are ours anyway |
| Reduce motion | Show frame 0 | Show the idle artboard paused |
| Lock-in | Open format | Open runtime, Rive-specific editor |

## Recommendation

Use **Rive** for characters (state machines and small files suit Duolingo-style characters), and keep **plain SVG with CSS** for simple UI effects (confetti, streak flame, XP pop). Lottie remains a fallback if we buy ready-made animation packs.

## Until then

`Tigris` (src/app/ui/tigris.ts) is a hand-built SVG with four states. It defines the component contract every character will follow:

- inputs: `state` (idle, talking, cheer, sad) and `animate`
- respects the reduce-motion setting
- has a text label for screen readers

When Rive arrives the component keeps the same inputs and swaps the inside, so no page changes.

## Spike plan (P1, about 2 days)

1. Draw Tigris in Rive with idle, talking, cheer, sad and a `talking` boolean.
2. Wrap it in an Angular component with the same inputs as today.
3. Measure on a mid-range Android phone: file size, first frame time, frame rate during a lesson, memory.
4. Check the reduce-motion path and offline loading (file cached with the app).
5. Decide: go Rive for all characters, or stay with SVG and CSS.

## Risks

- Art direction and the human cast are still open. The spike uses Tigris only.
- Rive runtime adds roughly 150-200 KB to the bundle, so it must load lazily on the lesson screen.
