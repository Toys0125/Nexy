# Nexy

Nexy is a friendship companion for NexVR. It started as a fork of VRCX but is now a **hard fork**: an independent project with its own direction, releases and history. It does not track VRCX and changes are not exchanged in either direction.

- Repo: `valzzu/Nexy` (`origin`). Main branch: `master`.
- `vrcx-team/VRCX` (`upstream`) is a read-only historical reference. It is not a source of updates.

## Hard fork rules

- Do not merge, rebase onto, or sync with `upstream`. Do not cherry-pick VRCX commits unless explicitly asked.
- When porting an idea or fix from VRCX, adapt it to Nexy's code; don't copy VRCX changes wholesale.
- Nexy targets NexVR. New features, names, docs and UI text should refer to Nexy and NexVR, not VRCX or VRChat.
- Keep existing VRChat-derived features. If one breaks on NexVR, fix the crash (guards, defaults, catches) instead of deleting it. Remove VRChat code only when asked.

## Branches, commits and PRs

- Never push to `master`. Work on a branch.
- Do not open a PR unless told to, so unfinished work doesn't get pushed. When told, open it against `valzzu/Nexy` `master`.
- The user is the sole author. Do not add yourself or any AI tool as a contributor or co-author: no `Co-Authored-By` trailers, no "Generated with" lines in PRs.

## Checks

- `npm run lint`, `npm run format:check`, `npm test`
- `npm run dev` runs the frontend; `npm run prod` builds it.
