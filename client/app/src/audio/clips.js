/**
 * Audio clip map — Marathi (mr), Hindi (hi) and English (en).
 * mr/hi generated with macOS Lekha (hi_IN) TTS voice; en with Rishi (en_IN).
 * Located in assets/audio/{lang}/*.m4a — see scripts/generate-clips.sh.
 *
 * All three packs carry the exact same 34 clip names (checked by
 * test/audio/clips.test.js) so CLIPS[lang] never silently falls back to
 * CLIPS.mr in practice — that fallback in src/audio/index.js stays as a
 * crash guard, not a real substitute for a missing language's audio.
 */

const mr = {
  // Category names
  cable:    require('../../assets/audio/mr/cable.m4a'),
  pcb:      require('../../assets/audio/mr/pcb.m4a'),
  panel:    require('../../assets/audio/mr/panel.m4a'),
  crt:      require('../../assets/audio/mr/crt.m4a'),
  battery:  require('../../assets/audio/mr/battery.m4a'),
  motor:    require('../../assets/audio/mr/motor.m4a'),
  plastic:  require('../../assets/audio/mr/plastic.m4a'),
  other:    require('../../assets/audio/mr/other.m4a'),
  // Conditions
  good:     require('../../assets/audio/mr/good.m4a'),
  fair:     require('../../assets/audio/mr/fair.m4a'),
  poor:     require('../../assets/audio/mr/poor.m4a'),
  // Units
  kg:       require('../../assets/audio/mr/kg.m4a'),
  pieces:   require('../../assets/audio/mr/pieces.m4a'),
  // Digits
  zero:     require('../../assets/audio/mr/zero.m4a'),
  one:      require('../../assets/audio/mr/one.m4a'),
  two:      require('../../assets/audio/mr/two.m4a'),
  three:    require('../../assets/audio/mr/three.m4a'),
  four:     require('../../assets/audio/mr/four.m4a'),
  five:     require('../../assets/audio/mr/five.m4a'),
  six:      require('../../assets/audio/mr/six.m4a'),
  seven:    require('../../assets/audio/mr/seven.m4a'),
  eight:    require('../../assets/audio/mr/eight.m4a'),
  nine:     require('../../assets/audio/mr/nine.m4a'),
  // Tens
  ten:      require('../../assets/audio/mr/ten.m4a'),
  twenty:   require('../../assets/audio/mr/twenty.m4a'),
  thirty:   require('../../assets/audio/mr/thirty.m4a'),
  forty:    require('../../assets/audio/mr/forty.m4a'),
  fifty:    require('../../assets/audio/mr/fifty.m4a'),
  sixty:    require('../../assets/audio/mr/sixty.m4a'),
  seventy:  require('../../assets/audio/mr/seventy.m4a'),
  eighty:   require('../../assets/audio/mr/eighty.m4a'),
  ninety:   require('../../assets/audio/mr/ninety.m4a'),
  // Large
  hundred:  require('../../assets/audio/mr/hundred.m4a'),
  thousand: require('../../assets/audio/mr/thousand.m4a'),
};

const hi = {
  cable:    require('../../assets/audio/hi/cable.m4a'),
  pcb:      require('../../assets/audio/hi/pcb.m4a'),
  panel:    require('../../assets/audio/hi/panel.m4a'),
  crt:      require('../../assets/audio/hi/crt.m4a'),
  battery:  require('../../assets/audio/hi/battery.m4a'),
  motor:    require('../../assets/audio/hi/motor.m4a'),
  plastic:  require('../../assets/audio/hi/plastic.m4a'),
  other:    require('../../assets/audio/hi/other.m4a'),
  good:     require('../../assets/audio/hi/good.m4a'),
  fair:     require('../../assets/audio/hi/fair.m4a'),
  poor:     require('../../assets/audio/hi/poor.m4a'),
  kg:       require('../../assets/audio/hi/kg.m4a'),
  pieces:   require('../../assets/audio/hi/pieces.m4a'),
  zero:     require('../../assets/audio/hi/zero.m4a'),
  one:      require('../../assets/audio/hi/one.m4a'),
  two:      require('../../assets/audio/hi/two.m4a'),
  three:    require('../../assets/audio/hi/three.m4a'),
  four:     require('../../assets/audio/hi/four.m4a'),
  five:     require('../../assets/audio/hi/five.m4a'),
  six:      require('../../assets/audio/hi/six.m4a'),
  seven:    require('../../assets/audio/hi/seven.m4a'),
  eight:    require('../../assets/audio/hi/eight.m4a'),
  nine:     require('../../assets/audio/hi/nine.m4a'),
  ten:      require('../../assets/audio/hi/ten.m4a'),
  twenty:   require('../../assets/audio/hi/twenty.m4a'),
  thirty:   require('../../assets/audio/hi/thirty.m4a'),
  forty:    require('../../assets/audio/hi/forty.m4a'),
  fifty:    require('../../assets/audio/hi/fifty.m4a'),
  sixty:    require('../../assets/audio/hi/sixty.m4a'),
  seventy:  require('../../assets/audio/hi/seventy.m4a'),
  eighty:   require('../../assets/audio/hi/eighty.m4a'),
  ninety:   require('../../assets/audio/hi/ninety.m4a'),
  hundred:  require('../../assets/audio/hi/hundred.m4a'),
  thousand: require('../../assets/audio/hi/thousand.m4a'),
};

const en = {
  cable:    require('../../assets/audio/en/cable.m4a'),
  pcb:      require('../../assets/audio/en/pcb.m4a'),
  panel:    require('../../assets/audio/en/panel.m4a'),
  crt:      require('../../assets/audio/en/crt.m4a'),
  battery:  require('../../assets/audio/en/battery.m4a'),
  motor:    require('../../assets/audio/en/motor.m4a'),
  plastic:  require('../../assets/audio/en/plastic.m4a'),
  other:    require('../../assets/audio/en/other.m4a'),
  good:     require('../../assets/audio/en/good.m4a'),
  fair:     require('../../assets/audio/en/fair.m4a'),
  poor:     require('../../assets/audio/en/poor.m4a'),
  kg:       require('../../assets/audio/en/kg.m4a'),
  pieces:   require('../../assets/audio/en/pieces.m4a'),
  zero:     require('../../assets/audio/en/zero.m4a'),
  one:      require('../../assets/audio/en/one.m4a'),
  two:      require('../../assets/audio/en/two.m4a'),
  three:    require('../../assets/audio/en/three.m4a'),
  four:     require('../../assets/audio/en/four.m4a'),
  five:     require('../../assets/audio/en/five.m4a'),
  six:      require('../../assets/audio/en/six.m4a'),
  seven:    require('../../assets/audio/en/seven.m4a'),
  eight:    require('../../assets/audio/en/eight.m4a'),
  nine:     require('../../assets/audio/en/nine.m4a'),
  ten:      require('../../assets/audio/en/ten.m4a'),
  twenty:   require('../../assets/audio/en/twenty.m4a'),
  thirty:   require('../../assets/audio/en/thirty.m4a'),
  forty:    require('../../assets/audio/en/forty.m4a'),
  fifty:    require('../../assets/audio/en/fifty.m4a'),
  sixty:    require('../../assets/audio/en/sixty.m4a'),
  seventy:  require('../../assets/audio/en/seventy.m4a'),
  eighty:   require('../../assets/audio/en/eighty.m4a'),
  ninety:   require('../../assets/audio/en/ninety.m4a'),
  hundred:  require('../../assets/audio/en/hundred.m4a'),
  thousand: require('../../assets/audio/en/thousand.m4a'),
};

export const CLIPS = { mr, hi, en };
