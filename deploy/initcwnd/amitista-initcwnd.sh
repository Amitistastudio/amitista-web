#!/bin/sh
set -e

WINDOW=20

for family in -4 -6; do
    spec=$(ip $family route show default 2>/dev/null | head -1 \
        | sed -e 's/ pref medium//' \
              -e 's/ initcwnd [0-9]*//' \
              -e 's/ initrwnd [0-9]*//')

    [ -n "$spec" ] || continue

    ip $family route replace $spec initcwnd "$WINDOW" initrwnd "$WINDOW"
done
