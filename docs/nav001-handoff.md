# NAV-001 handoff

NAV-001 tested the production Windows navigation adapter with one human-approved, navigation-only plan. Private screen references classified the initial page as Lobby and the prepared plan used the current/default selected character without clicking a character card.

The runtime dispatched the first planned foreground click (`Lobby -> Stash`). Windows reported successful `SendInput` dispatch, but the game remained on Lobby and the expected Stash classification did not arrive within the ten-second transition timeout. The state machine stopped immediately with `transition-timeout-open-stash`. It sent one click total, did not retry, and did not execute the remaining four steps.

The passive capture contained bidirectional transport traffic, 40 valid application frames, zero discarded framing bytes, and no command-44 or command-552 state message. Therefore NAV-001 did not reach the character-reselection path and provides no new evidence about post-reselection command-44 behavior.

All screenshots, reference templates, live coordinates, transition observations, logs, PCAP data, and private plans remain gitignored under `fixtures-private`. The repository-visible review contains aggregate evidence only.

The next checkpoint requires an explicit product decision. Ordinary foreground `SendInput` was not proven usable by this test, and the safety policy forbids retries or an input bypass. No further live click should be attempted without new human authorization and a separately reviewed input approach.
