# cmd-mod-xp

![demo](./demo.gif)

xp and levels for shipping in command code.

## install

```bash
cmd mods add npm:cmd-mod-xp -g
```

## what earns xp

| action | xp |
|---|---|
| tests pass | +10 |
| build passes | +15 |
| commit | +25 |
| push | +40 |
| deploy / publish | +100 |
| bug squashed (tests pass after a fail) | +20 |
| tried (tests failed) | +2 |
| day streak (first action each day) | +10 |

there is an 8 second cooldown per action so you can't farm xp by spamming the same command.

## levels

1000 levels. each one costs a little more than the last (lvl 2 is 50 xp, lvl 100 is ~15k, lvl 1000 is ~1m). titles change roughly every 91 levels, in this order:

1. napkin coder
2. tinkerer
3. hacker
4. builder
5. shipper
6. maker
7. architect
8. 10x
9. wizard
10. legend
11. mythic

## /level

run `/level` to see your rank, xp bar, streak and lifetime counts. your current level also sits in the status row under the input.

progress is saved to `~/.commandcode/xp.json`. to reset, delete the file.

## license

mit
