# Navigation transition wait policy

NAV-002 proved that the `enter-lobby` click reached the game and produced a complete command-44 state about 759 ms later, while visual Lobby classification did not complete inside the previous ten-second deadline. Character loading time varies with machine and storage performance, so it must not share the same deadline as ordinary top-navigation changes.

The runtime now uses these defaults:

| Transition | Deadline | Poll interval |
| --- | ---: | ---: |
| Ordinary page or top-tab transition | 10 seconds | 500 ms |
| Character Selection to Lobby | 30 seconds | 500 ms |

The character-loading deadline can be configured from 1 to 60 seconds. Thirty seconds is the default rather than an unconditional delay: the runner proceeds as soon as Lobby is positively classified, so a fast machine does not wait longer.

After a reviewed click, transient `unknown`, `ambiguous`, or still-visible source-screen frames are treated as loading and polled until the step deadline. No later click is dispatched until the expected destination is positively classified. Foreground-window, window-bounds, display-geometry, and primary-display mismatches still stop immediately. Preflight classification before any click also remains fail-closed.

The polling interval changed from 100 ms to 500 ms to reduce screenshot and PowerShell-process overhead during slow loads. This policy adds no retry and never repeats the click that began the transition.
