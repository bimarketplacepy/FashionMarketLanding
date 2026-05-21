---
name: ScrollTrigger pin handoff jolt
description: Why pinned scrollytelling sections built with GSAP ScrollTrigger + React.lazy feel jolty, and what the durable rule is.
---

When a page stacks multiple full-viewport sections that each register their own `ScrollTrigger.create({ pin: true })` from inside a React mount effect, every pin injects a "pin spacer" element into the document layout. The user-visible smoothness of pin handoffs depends on those spacers existing **before** the user begins scrolling.

**Rule:** scenes that own a pin must be mounted eagerly (plain ESM import), not via `React.lazy` / `Suspense`, even if it costs initial-bundle size.

**Why:** with `React.lazy`, each scene's chunk resolves over the network as the user scrolls toward it. When the chunk finally lands, React mounts the component, its `useEffect` runs, ScrollTrigger inserts the pin spacer, and **total document height changes under the user mid-scroll**. The result is a perceptible jolt at every section boundary plus broken pin geometry for downstream sections until the next `ScrollTrigger.refresh()`. Even an `IntersectionObserver` "lazy mount" gate has the same effect because mount still happens just-in-time.

**How to apply:**
- Single-route art piece / one-page scrolly site → import every pinned scene eagerly. There's nowhere to lazy-defer to anyway.
- Multi-route app where pinned sections live on one route → eager-import them within that route module, but the route itself can still be lazy.
- After all pin-owning scenes have mounted, run **one** coordinated `ScrollTrigger.refresh()` (e.g. `setTimeout(..., 0)` in the Lenis/SmoothScroll hook) to settle layout work that raced the initial per-trigger measurements (font load, image load, etc.). Per-scene refreshes are not needed.
- `pinSpacing: true` on every trigger and sibling sections at `h-[100vh]` with no margins are necessary but not sufficient — they only matter once the spacers actually exist.
- Lenis smoothing window matters too: `duration > ~1s` lets scroll drift past pin start/end edges before ScrollTrigger registers, which compounds any handoff fuzziness. ~0.8s with cubic ease-out is a known-good baseline for this pattern.
