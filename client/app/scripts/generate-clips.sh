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
#   scripts/generate-clips.sh <lang> [phrases]
#
#   <lang> is one of: mr | hi | en
#
#   Passing the literal second argument `phrases` generates ONLY the phrase
#   pack (screen headings and spoken status lines, one clip per i18n key) and
#   leaves the 34 word clips untouched. Without it the original word pack is
#   generated, which OVERWRITES the existing reviewed recordings.
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
MODE="${2:-words}"
if [[ -z "$LANG_CODE" ]]; then
  echo "Usage: $0 <mr|hi|en> [phrases]" >&2
  exit 1
fi
if [[ "$MODE" != "words" && "$MODE" != "phrases" ]]; then
  echo "Unknown mode '$MODE' — expected 'phrases' or nothing" >&2
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

# ---------------------------------------------------------------------------
# Phrase pack — one clip per i18n key spoken through useVoice().speakKey().
#
# These exist because expo-speech is silent on any handset with no mr-IN/hi-IN
# voice installed, which is most of them: the OS-default (English) voice given
# Devanagari text produces nothing. Screen headings therefore ship as bundled
# audio, exactly like the digits do. The clip NAME is the i18n key from
# src/i18n/strings.js; the spoken phrase is that key's translation.
#
# requests_pending_{one,other} deliberately omit the {count} placeholder —
# useVoice().speakKey() prepends the number as digit clips, and in all three
# languages the count is spoken first.
# ---------------------------------------------------------------------------
declare -a EN_SENTENCES=(
  "accept_label:Accept"
  "camera_prompt:Take Photo"
  "category_label:Category"
  "condition_label:Condition"
  "earnings_title:Total Earnings"
  "handover_confirmed:Confirmed"
  "handover_label:Handover"
  "home_title:Bhaav Collector"
  "price_board_title:Price Board"
  "quantity_label:Quantity"
  "report_problem_success:Report submitted"
  "requests_pending_one:request pending"
  "requests_pending_other:requests pending"
  "safety_title:Safety Guidelines"
  "source_label:Source"
  "subcategory_label:Sub-category"
  "value_label:Estimated Value"
  "voice_accepted:Accepted"
  "voice_dispute_recorded:Your objection has been recorded"
  "voice_error_generic:Something went wrong, please try again"
  "voice_handover_confirmed:Handover confirmed"
)

declare -a HI_SENTENCES=(
  "accept_label:स्वीकार करें"
  "camera_prompt:फ़ोटो लें"
  "category_label:प्रकार"
  "condition_label:स्थिति"
  "earnings_title:कुल कमाई"
  "handover_confirmed:पुष्टि हो गई"
  "handover_label:हस्तांतरण"
  "home_title:भाव संग्राहक"
  "price_board_title:दर पट्टिका"
  "quantity_label:मात्रा"
  "report_problem_success:शिकायत दर्ज की गई"
  "requests_pending_one:अनुरोध लंबित"
  "requests_pending_other:अनुरोध लंबित"
  "safety_title:सुरक्षा निर्देश"
  "source_label:स्रोत"
  "subcategory_label:उपप्रकार"
  "value_label:अनुमानित मूल्य"
  "voice_accepted:स्वीकार किया गया"
  "voice_dispute_recorded:आपकी आपत्ति दर्ज कर ली गई"
  "voice_error_generic:त्रुटि हुई, दोबारा प्रयास करें"
  "voice_handover_confirmed:हस्तांतरण की पुष्टि हो गई"
)

declare -a MR_SENTENCES=(
  "accept_label:स्वीकार करा"
  "camera_prompt:फोटो घ्या"
  "category_label:प्रकार"
  "condition_label:स्थिती"
  "earnings_title:एकूण कमाई"
  "handover_confirmed:पुष्टी झाली"
  "handover_label:हस्तांतरण"
  "home_title:भाव संग्राहक"
  "price_board_title:दर पत्रक"
  "quantity_label:प्रमाण"
  "report_problem_success:तक्रार नोंदवली"
  "requests_pending_one:विनंती प्रलंबित"
  "requests_pending_other:विनंत्या प्रलंबित"
  "safety_title:सुरक्षा सूचना"
  "source_label:स्रोत"
  "subcategory_label:उपप्रकार"
  "value_label:अंदाजे मूल्य"
  "voice_accepted:स्वीकारले"
  "voice_dispute_recorded:तुमचा आक्षेप नोंदवला"
  "voice_error_generic:चूक झाली, पुन्हा प्रयत्न करा"
  "voice_handover_confirmed:हस्तांतरण पुष्टी झाली"
)

if [[ "$MODE" == "phrases" ]]; then
  case "$LANG_CODE" in
    en) PHRASES=("${EN_SENTENCES[@]}") ;;
    hi) PHRASES=("${HI_SENTENCES[@]}") ;;
    mr) PHRASES=("${MR_SENTENCES[@]}") ;;
  esac
else
  case "$LANG_CODE" in
    en) PHRASES=("${EN_PHRASES[@]}") ;;
    hi) PHRASES=("${HI_PHRASES[@]}") ;;
    mr) PHRASES=("${MR_PHRASES[@]}") ;;
  esac
fi

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
