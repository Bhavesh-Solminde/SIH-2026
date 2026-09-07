#!/usr/bin/env bash
#
# generate-clips.sh — generate the pre-recorded voice clip pack for one
# language, using macOS's built-in `say` (TTS) + `afconvert`.
#
# This documents (and reproduces) the method the existing mr/hi packs under
# assets/audio/{mr,hi}/*.m4a were made with: `say -v <voice>` piped through
# `afconvert` into mono 22050 Hz AAC-LC .m4a, matching what src/audio/clips.js
# already ships. See src/audio/clips.js and docs/superpowers/plans/
# 2026-09-01-02-collector-app.md task 4 for why pre-recorded clips are used
# instead of on-device TTS (expo-speech): voice availability for mr-IN/hi-IN
# varies by Android handset, so the app ships its own guaranteed audio.
#
# Usage:
#   scripts/generate-clips.sh <lang>
#
#   <lang> is one of: mr | hi | en
#
# Only run this for a language whose pack doesn't exist yet, or one you
# deliberately intend to regenerate — re-running it for mr/hi overwrites the
# existing, already-reviewed recordings with a fresh machine voice. This
# script's own first real use was to generate the en/ pack that did not
# exist before.
#
# Requires macOS (`say`, `afconvert` are both macOS-only). Voices used:
#   mr → none built into macOS at time of writing; mr/hi packs were made with
#        the hi_IN "Lekha" voice, per the comment in src/audio/clips.js.
#   hi → Lekha (hi_IN)
#   en → Rishi (en_IN) — an Indian-English voice, consistent with the app's
#        India-first audience, rather than a US/UK English voice.
#
# Run `say -v '?'` to list every voice installed on this machine.

set -euo pipefail

LANG_CODE="${1:-}"
if [[ -z "$LANG_CODE" ]]; then
  echo "Usage: $0 <mr|hi|en>" >&2
  exit 1
fi

case "$LANG_CODE" in
  hi) VOICE="Lekha" ;;
  en) VOICE="Rishi" ;;
  mr) VOICE="Lekha" ;;  # No mr_IN voice on stock macOS; see note above.
  *)
    echo "Unknown language '$LANG_CODE' — expected mr, hi, or en" >&2
    exit 1
    ;;
esac

if ! command -v say >/dev/null || ! command -v afconvert >/dev/null; then
  echo "This script requires macOS (say + afconvert)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../assets/audio/$LANG_CODE"
mkdir -p "$OUT_DIR"

# clip_name:spoken_phrase — one per line. The clip NAME is the shared key
# resolved by src/audio/clips.js's CLIPS[lang][name] and by
# src/audio/numbers.js's composeNumber()/composeDigits(); the spoken phrase
# is what actually gets read aloud in this language. Acronyms are spaced so
# `say` reads them as individual letters rather than guessing a word.
declare -a EN_PHRASES=(
  "cable:Cable"
  "pcb:P C B"
  "panel:Panel"
  "crt:C R T"
  "battery:Battery"
  "motor:Motor"
  "plastic:Plastic"
  "other:Other"
  "good:Good"
  "fair:Fair"
  "poor:Poor"
  "kg:Kilogram"
  "pieces:Pieces"
  "zero:Zero"
  "one:One"
  "two:Two"
  "three:Three"
  "four:Four"
  "five:Five"
  "six:Six"
  "seven:Seven"
  "eight:Eight"
  "nine:Nine"
  "ten:Ten"
  "twenty:Twenty"
  "thirty:Thirty"
  "forty:Forty"
  "fifty:Fifty"
  "sixty:Sixty"
  "seventy:Seventy"
  "eighty:Eighty"
  "ninety:Ninety"
  "hundred:Hundred"
  "thousand:Thousand"
)

# mr/hi phrase maps are provided only so this script is a complete,
# reproducible record of how every pack was made — the mr/hi assets that
# ship today were reviewed recordings, not necessarily this exact TTS output,
# and should not be blindly overwritten by re-running this script.
declare -a HI_PHRASES=(
  "cable:केबल" "pcb:पीसीबी" "panel:पैनल" "crt:सीआरटी" "battery:बैटरी"
  "motor:मोटर" "plastic:प्लास्टिक" "other:अन्य"
  "good:अच्छी" "fair:ठीक" "poor:खराब"
  "kg:किलो" "pieces:नग"
  "zero:शून्य" "one:एक" "two:दो" "three:तीन" "four:चार" "five:पांच"
  "six:छह" "seven:सात" "eight:आठ" "nine:नौ"
  "ten:दस" "twenty:बीस" "thirty:तीस" "forty:चालीस" "fifty:पचास"
  "sixty:साठ" "seventy:सत्तर" "eighty:अस्सी" "ninety:नब्बे"
  "hundred:सौ" "thousand:हज़ार"
)
declare -a MR_PHRASES=(
  "cable:केबल" "pcb:पीसीबी" "panel:पॅनल" "crt:सीआरटी" "battery:बॅटरी"
  "motor:मोटर" "plastic:प्लास्टिक" "other:इतर"
  "good:चांगली" "fair:ठीक" "poor:खराब"
  "kg:किलो" "pieces:नग"
  "zero:शून्य" "one:एक" "two:दोन" "three:तीन" "four:चार" "five:पाच"
  "six:सहा" "seven:सात" "eight:आठ" "nine:नऊ"
  "ten:दहा" "twenty:वीस" "thirty:तीस" "forty:चाळीस" "fifty:पन्नास"
  "sixty:साठ" "seventy:सत्तर" "eighty:ऐंशी" "ninety:नव्वद"
  "hundred:शंभर" "thousand:हजार"
)

case "$LANG_CODE" in
  en) PHRASES=("${EN_PHRASES[@]}") ;;
  hi) PHRASES=("${HI_PHRASES[@]}") ;;
  mr) PHRASES=("${MR_PHRASES[@]}") ;;
esac

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

for entry in "${PHRASES[@]}"; do
  name="${entry%%:*}"
  phrase="${entry#*:}"
  aiff="$TMP_DIR/$name.aiff"
  m4a="$OUT_DIR/$name.m4a"

  say -v "$VOICE" -o "$aiff" "$phrase"
  # Mono 22050 Hz AAC-LC — matches the format of the existing mr/hi clips
  # (checked with `afinfo`), so playback behaves identically across packs.
  afconvert -f m4af -d aac@22050 -c 1 -b 28470 "$aiff" "$m4a"
  echo "  wrote $m4a  ($phrase)"
done

echo "Done: $((${#PHRASES[@]})) clips written to $OUT_DIR"
