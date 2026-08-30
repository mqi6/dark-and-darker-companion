# NAV-002 handoff

NAV-002 tested the reviewed DnDTools-parity ordinary foreground input backend. The approved plan used `dndtools-sendinput-v1`, the current/default selected character, and a complete game client contained on the primary display.

The first three transitions completed and were classified successfully: Lobby to Stash, Stash to Lobby, and Lobby to Character Selection. The runtime then dispatched Enter Lobby. A successful, complete command-44 character state with ten containers arrived approximately 0.76 seconds after that dispatch, proving that the server processed the character-reselection path. The screen classifier did not observe Lobby before the ten-second timeout, so the runtime stopped with `transition-timeout-enter-lobby`. It sent four clicks total, did not retry, and did not send the final Stash click.

The passive capture contained bidirectional transport traffic, 74 valid application frames, zero discarded framing bytes, one command-44 frame, and no command-552 frame. The command-44 response had `result=1` and passed structural completeness and unique-identity validation. Private item counts, container identifiers, layouts, identities, packet data, timestamps, screenshots, templates, and live coordinates remain omitted.

NAV-002 therefore validates the DnDTools-parity input method for three navigation transitions and establishes that a complete newer command-44 state arrives after the automated character-reselection path. It does not validate the final return-to-Stash transition because fail-closed screen confirmation stopped the sequence first.

Any next live checkpoint requires separate human authorization. It should investigate the character-selection-to-Lobby visual transition and timeout/classification behavior without retrying this recording or weakening the page-confirmation gate.
