/**
 * UI strings for Marathi (mr), Hindi (hi) and English (en).
 *
 * The catalogue is **key-major**: every key holds all three translations side
 * by side. It used to be language-major (one object per language), which meant
 * adding a string required three edits hundreds of lines apart and a forgotten
 * translation was invisible. With this shape a missing translation is a
 * visibly short line, and `test/i18n/strings.test.js` fails on it by name.
 *
 * Plural keys use the `_one` / `_other` suffix convention and are selected by
 * `t(key, { count })` — see `useStrings.js`. Interpolation placeholders are
 * `{name}` and are filled from the same params object.
 *
 * Keys prefixed `nav_` are navigator titles; `voice_` are phrases spoken
 * through `useVoice().speak()` rather than rendered. Both must be catalogued:
 * the TTS locale follows the active language, so a hardcoded Marathi phrase
 * gets read aloud by a Hindi voice.
 */

/** Supported language tags, in switcher order. */
export const LANGS = ['mr', 'hi', 'en'];

const catalogue = {
  // ---------------------------------------------------------------------
  // Navigator titles
  // ---------------------------------------------------------------------
  nav_home:            { mr: 'नवीन',            hi: 'नया',                en: 'New' },
  nav_home_header:     { mr: 'भाव संग्राहक',     hi: 'भाव संग्राहक',        en: 'Bhaav Collector' },
  nav_requests:        { mr: 'विनंत्या',         hi: 'अनुरोध',              en: 'Requests' },
  nav_requests_header: { mr: 'प्रलंबित विनंत्या', hi: 'लंबित अनुरोध',        en: 'Pending Requests' },
  nav_lots:            { mr: 'नोंदी',            hi: 'प्रविष्टियाँ',         en: 'Lots' },
  nav_lots_header:     { mr: 'माझ्या नोंदी',      hi: 'मेरी प्रविष्टियाँ',    en: 'My Lots' },
  nav_ledger:          { mr: 'कमाई',            hi: 'कमाई',               en: 'Earnings' },
  nav_ledger_header:   { mr: 'कमाई',            hi: 'कमाई',               en: 'Earnings' },
  nav_rates:           { mr: 'दर',              hi: 'दर',                 en: 'Rates' },
  nav_rates_header:    { mr: 'दर पत्रक',         hi: 'दर पट्टिका',          en: 'Price Board' },
  nav_camera:          { mr: 'फोटो घ्या',        hi: 'फ़ोटो लें',            en: 'Take photo' },
  nav_category:        { mr: 'प्रकार',           hi: 'प्रकार',              en: 'Category' },
  nav_subcategory:     { mr: 'उपप्रकार',         hi: 'उपप्रकार',            en: 'Sub-category' },
  nav_quantity:        { mr: 'प्रमाण',           hi: 'मात्रा',              en: 'Quantity' },
  nav_condition:       { mr: 'स्थिती',           hi: 'स्थिति',              en: 'Condition' },
  nav_source:          { mr: 'स्रोत',            hi: 'स्रोत',               en: 'Source' },
  nav_value:           { mr: 'अंदाजे मूल्य',      hi: 'अनुमानित मूल्य',      en: 'Estimated value' },
  nav_accept:          { mr: 'स्वीकार',          hi: 'स्वीकार',             en: 'Accept' },
  nav_handover:        { mr: 'हस्तांतरण',        hi: 'हस्तांतरण',           en: 'Handover' },
  nav_safety:          { mr: 'सुरक्षा सूचना',     hi: 'सुरक्षा निर्देश',      en: 'Safety guidelines' },

  // ---------------------------------------------------------------------
  // Home
  // ---------------------------------------------------------------------
  home_title:        { mr: 'भाव संग्राहक',   hi: 'भाव संग्राहक',   en: 'Bhaav Collector' },
  home_subtitle:     { mr: 'ई-कचरा नोंद करा', hi: 'ई-कचरा दर्ज करें', en: 'Record E-Waste' },
  home_new_lot:      { mr: 'नवीन नोंद',      hi: 'नई प्रविष्टि',    en: 'New Entry' },
  home_history:      { mr: 'इतिहास',        hi: 'इतिहास',        en: 'History' },
  home_earnings:     { mr: 'कमाई',          hi: 'कमाई',          en: 'Earnings' },
  home_price_board:  { mr: 'दर पत्रक',       hi: 'दर पट्टिका',     en: 'Price Board' },
  home_view_rates:   { mr: 'भाव पाहा',      hi: 'भाव देखें',      en: 'View rates' },
  home_synced:       { mr: 'अद्ययावत',      hi: 'अद्यतन',        en: 'Up to date' },
  home_sync_pending: { mr: '{count} बाकी',   hi: '{count} शेष',   en: '{count} pending' },

  // ---------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------
  camera_prompt:     { mr: 'फोटो घ्या',              hi: 'फ़ोटो लें',                 en: 'Take Photo' },
  camera_retake:     { mr: 'पुन्हा घ्या',             hi: 'दोबारा लें',                en: 'Retake' },
  camera_confirm:    { mr: 'पुष्टी करा',             hi: 'पुष्टि करें',                en: 'Confirm' },
  camera_permission: { mr: 'कॅमेरा परवानगी आवश्यक',   hi: 'कैमरा अनुमति आवश्यक है',    en: 'Camera permission required' },

  // ---------------------------------------------------------------------
  // Category / sub-category
  // ---------------------------------------------------------------------
  category_label:    { mr: 'प्रकार',        hi: 'प्रकार',       en: 'Category' },
  category_cable:    { mr: 'केबल',         hi: 'केबल',        en: 'Cable' },
  category_pcb:      { mr: 'पीसीबी',       hi: 'पीसीबी',      en: 'PCB' },
  category_panel:    { mr: 'पॅनल',         hi: 'पैनल',        en: 'Panel' },
  category_crt:      { mr: 'CRT मॉनिटर',   hi: 'CRT मॉनिटर',  en: 'CRT Monitor' },
  category_battery:  { mr: 'बॅटरी',        hi: 'बैटरी',       en: 'Battery' },
  category_motor:    { mr: 'मोटर',         hi: 'मोटर',        en: 'Motor' },
  category_plastic:  { mr: 'प्लास्टिक',     hi: 'प्लास्टिक',    en: 'Plastic' },
  category_other:    { mr: 'इतर',          hi: 'अन्य',        en: 'Other' },
  subcategory_label: { mr: 'उपप्रकार',      hi: 'उपप्रकार',     en: 'Sub-category' },
  subcategory_mixed: { mr: 'मिश्र',         hi: 'मिश्रित',      en: 'Mixed' },

  // ---------------------------------------------------------------------
  // Quantity
  // ---------------------------------------------------------------------
  quantity_label:       { mr: 'प्रमाण',        hi: 'मात्रा',           en: 'Quantity' },
  quantity_kg:          { mr: 'किलो',         hi: 'किलो',            en: 'kg' },
  quantity_pieces:      { mr: 'नग',           hi: 'नग',             en: 'pcs' },
  quantity_placeholder: { mr: 'प्रमाण टाका',   hi: 'मात्रा दर्ज करें',  en: 'Enter quantity' },

  // ---------------------------------------------------------------------
  // Condition
  // ---------------------------------------------------------------------
  condition_label: { mr: 'स्थिती',  hi: 'स्थिति',  en: 'Condition' },
  condition_good:  { mr: 'चांगली',  hi: 'अच्छी',   en: 'Good' },
  condition_fair:  { mr: 'ठीक',    hi: 'ठीक',    en: 'Fair' },
  condition_poor:  { mr: 'खराब',   hi: 'खराब',   en: 'Poor' },

  // ---------------------------------------------------------------------
  // Source
  // ---------------------------------------------------------------------
  source_label:         { mr: 'स्रोत',        hi: 'स्रोत',       en: 'Source' },
  source_household:     { mr: 'घर',          hi: 'घर',         en: 'Household' },
  source_shop:          { mr: 'दुकान',        hi: 'दुकान',       en: 'Shop' },
  source_office:        { mr: 'कार्यालय',     hi: 'कार्यालय',    en: 'Office' },
  source_institutional: { mr: 'संस्था',       hi: 'संस्था',      en: 'Institution' },
  source_street:        { mr: 'रस्त्यावरून',   hi: 'सड़क से',     en: 'Street' },
  source_other:         { mr: 'इतर',         hi: 'अन्य',       en: 'Other' },

  // ---------------------------------------------------------------------
  // Value
  // ---------------------------------------------------------------------
  value_label: { mr: 'अंदाजे मूल्य', hi: 'अनुमानित मूल्य', en: 'Estimated Value' },
  value_unit:  { mr: '₹',          hi: '₹',            en: '₹' },

  // ---------------------------------------------------------------------
  // Accept / handover
  // ---------------------------------------------------------------------
  accept_label:       { mr: 'स्वीकार करा',           hi: 'स्वीकार करें',            en: 'Accept' },
  accept_confirm:     { mr: 'खात्री करा',            hi: 'पुष्टि करें',             en: 'Confirm' },
  handover_label:     { mr: 'हस्तांतरण',             hi: 'हस्तांतरण',              en: 'Handover' },
  handover_confirm:   { mr: 'हस्तांतरण पक्के करा',    hi: 'हस्तांतरण पक्का करें',    en: 'Confirm Handover' },
  handover_pending:   { mr: 'प्रलंबित',              hi: 'लंबित',                 en: 'Pending' },
  handover_confirmed: { mr: 'पुष्टी झाली',            hi: 'पुष्टि हो गई',           en: 'Confirmed' },
  handover_disputed:  { mr: 'वाद',                  hi: 'विवाद',                 en: 'Disputed' },

  // ---------------------------------------------------------------------
  // Earnings / price board
  // ---------------------------------------------------------------------
  earnings_title:      { mr: 'एकूण कमाई',           hi: 'कुल कमाई',              en: 'Total Earnings' },
  earnings_today:      { mr: 'आजची कमाई',          hi: 'आज की कमाई',           en: "Today's Earnings" },
  earnings_week:       { mr: 'या आठवड्याची कमाई',   hi: 'इस सप्ताह की कमाई',     en: 'This Week' },
  earnings_month:      { mr: 'या महिन्याची कमाई',    hi: 'इस माह की कमाई',       en: 'This Month' },
  price_board_title:   { mr: 'दर पत्रक',            hi: 'दर पट्टिका',            en: 'Price Board' },
  price_board_per_kg:  { mr: 'प्रति किलो',          hi: 'प्रति किलो',            en: 'per kg' },
  price_board_per_pc:  { mr: 'प्रति नग',            hi: 'प्रति नग',              en: 'per pc' },
  price_board_updated: { mr: 'अपडेट केले',          hi: 'अपडेट किया',            en: 'Updated' },

  // ---------------------------------------------------------------------
  // Safety
  // ---------------------------------------------------------------------
  safety_title:       { mr: 'सुरक्षा सूचना',   hi: 'सुरक्षा निर्देश',  en: 'Safety Guidelines' },
  safety_gloves:      { mr: 'हातमोजे घाला',   hi: 'दस्ताने पहनें',    en: 'Wear gloves' },
  safety_no_fire:     { mr: 'आग लावू नका',    hi: 'आग न लगाएं',     en: 'Do not burn' },
  safety_ventilation: { mr: 'हवा खेळती ठेवा',  hi: 'हवा बहने दें',    en: 'Ensure ventilation' },

  // ---------------------------------------------------------------------
  // Shared
  // ---------------------------------------------------------------------
  ok:            { mr: 'ठीक आहे',                        hi: 'ठीक है',                          en: 'OK' },
  cancel:        { mr: 'रद्द करा',                        hi: 'रद्द करें',                        en: 'Cancel' },
  save:          { mr: 'जतन करा',                        hi: 'सहेजें',                           en: 'Save' },
  back:          { mr: 'मागे',                            hi: 'वापस',                            en: 'Back' },
  next:          { mr: 'पुढे',                            hi: 'आगे',                             en: 'Next' },
  done:          { mr: 'झाले',                           hi: 'हो गया',                          en: 'Done' },
  loading:       { mr: 'लोड होत आहे…',                    hi: 'लोड हो रहा है…',                   en: 'Loading…' },
  error_generic: { mr: 'काही चूक झाली. पुन्हा प्रयत्न करा.', hi: 'कुछ गलत हुआ। दोबारा कोशिश करें।', en: 'Something went wrong. Please try again.' },
  retry:         { mr: 'पुन्हा प्रयत्न करा',                hi: 'दोबारा कोशिश करें',                en: 'Retry' },
  inaction_note: { mr: 'संग्राहक वेळेवर येईल.',             hi: 'संग्राहक समय पर आएगा।',            en: 'The collector will arrive as planned.' },
  no_recyclers:  { mr: 'कोणताही अधिकृत पुनर्वापरकर्ता उपलब्ध नाही', hi: 'कोई अधिकृत पुनर्चक्रणकर्ता उपलब्ध नहीं', en: 'No authorized recycler available' },

  // ---------------------------------------------------------------------
  // Pending requests — plural pair, resolved by t(key, { count })
  // ---------------------------------------------------------------------
  requests_pending_one:   { mr: '{count} विनंती प्रलंबित',   hi: '{count} अनुरोध लंबित', en: '{count} request pending' },
  requests_pending_other: { mr: '{count} विनंत्या प्रलंबित', hi: '{count} अनुरोध लंबित', en: '{count} requests pending' },

  refresh:                { mr: 'ताजे करा', hi: 'ताज़ा करें', en: 'Refresh' },
  waiting:                { mr: 'प्रतीक्षा…', hi: 'प्रतीक्षा…', en: 'Waiting…' },

  requests_empty_title:      { mr: 'कोणतीही विनंती नाही', hi: 'कोई अनुरोध नहीं', en: 'No requests' },
  requests_empty_sub:        { mr: 'पुनर्वापरकर्त्याने माल तपासल्यावर येथे दिसेल.', hi: 'पुनर्चक्रणकर्ता द्वारा माल जांचे जाने पर यहाँ दिखेगा।', en: 'This will appear once the recycler inspects the lot.' },
  requests_view_details_a11y:{ mr: 'तपशील पहा', hi: 'विवरण देखें', en: 'View details' },
  requests_reference:        { mr: 'संदर्भ: {code}', hi: 'संदर्भ: {code}', en: 'Reference: {code}' },
  requests_tap_for_qr:       { mr: 'QR पाहण्यासाठी टच करा →', hi: 'QR देखने के लिए टच करें →', en: 'Tap to view QR →' },
  requests_listen_amount:    { mr: 'रक्कम ऐका', hi: 'राशि सुनें', en: 'Listen to amount' },
  requests_agree:            { mr: 'सहमत आहे', hi: 'सहमत हूँ', en: 'Agree' },
  requests_disagree:         { mr: 'सहमत नाही', hi: 'सहमत नहीं', en: 'Disagree' },

  dispute_confirm_title:   { mr: 'ही रक्कम चुकीची आहे?', hi: 'क्या यह राशि गलत है?', en: 'Is this amount wrong?' },
  dispute_confirm_message: { mr: '₹{amount} वर तुमची सहमती नाही, असे नोंदवले जाईल.', hi: '₹{amount} पर आपकी सहमति नहीं है, यह दर्ज किया जाएगा।', en: 'This will record that you do not agree to ₹{amount}.' },
  dispute_cancel:          { mr: 'नको', hi: 'नहीं', en: 'No' },
  dispute_confirm_yes:     { mr: 'होय, नोंदवा', hi: 'हाँ, दर्ज करें', en: 'Yes, record it' },

  voice_handover_confirmed: { mr: 'हस्तांतरण पुष्टी झाली',   hi: 'हस्तांतरण की पुष्टि हो गई', en: 'Handover confirmed' },
  voice_error_generic:      { mr: 'चूक झाली, पुन्हा प्रयत्न करा', hi: 'त्रुटि हुई, दोबारा प्रयास करें', en: 'Something went wrong, please try again' },
  voice_dispute_recorded:   { mr: 'तुमचा आक्षेप नोंदवला',    hi: 'आपकी आपत्ति दर्ज कर ली गई',  en: 'Your objection has been recorded' },

  // ---------------------------------------------------------------------
  // Safety cards
  // ---------------------------------------------------------------------
  safety_card_no_fire:     { mr: 'केबल जाळू नका — विषारी धूर निघतो.',                    hi: 'केबल मत जलाएं — जहरीला धुआं निकलता है।',            en: 'Do not burn cables — they release toxic smoke.' },
  safety_card_battery:     { mr: 'बॅटरी उघडू नका — आत ऍसिड असते.',                       hi: 'बैटरी मत खोलें — अंदर एसिड होता है।',                en: 'Do not open batteries — they contain acid inside.' },
  safety_card_crt:         { mr: 'CRT टीव्ही काळजीपूर्वक हाताळा — काच जड असते.',            hi: 'CRT टीवी सावधानी से उठाएं — कांच भारी होता है।',      en: 'Handle CRT TVs carefully — the glass is heavy.' },
  safety_card_no_acid:     { mr: 'बोर्डवर ऍसिड वापरू नका — ते बेकायदेशीर आहे.',            hi: 'बोर्ड पर एसिड मत डालें — यह गैरकानूनी है।',          en: 'Do not use acid on boards — it is illegal.' },
  safety_card_gloves:      { mr: 'हातमोजे घाला — इलेक्ट्रॉनिक कचरा हाताळताना.',            hi: 'दस्ताने पहनें — इलेक्ट्रॉनिक कचरा उठाते समय।',        en: 'Wear gloves while handling e-waste.' },
  safety_card_ventilation: { mr: 'हवा खेळती ठेवा — बंद खोलीत काम करू नका.',                hi: 'हवादार जगह पर काम करें — बंद कमरे में नहीं।',         en: 'Keep the area ventilated — do not work in a closed room.' },
  safety_listen:           { mr: 'ऐका', hi: 'सुनें', en: 'Listen' },
  safety_swipe_hint:       { mr: '{current} / {total} — स्वाइप करा', hi: '{current} / {total} — स्वाइप करें', en: '{current} / {total} — Swipe' },

  // ---------------------------------------------------------------------
  // Accept
  // ---------------------------------------------------------------------
  authorized_label:              { mr: 'अधिकृत', hi: 'अधिकृत', en: 'Authorized' },
  accept_distance_km:            { mr: '{km} किमी', hi: '{km} किमी', en: '{km} km' },
  accept_directions_failed_title:{ mr: 'नकाशा उघडता आला नाही', hi: 'नक्शा नहीं खोला जा सका', en: 'Could not open the map' },
  accept_success_title:          { mr: 'स्वीकारले!', hi: 'स्वीकार किया गया!', en: 'Accepted!' },
  accept_will_notify:            { mr: '{name} ला कळवले जाईल.', hi: '{name} को सूचित किया जाएगा।', en: '{name} will be notified.' },
  accept_sync_pending:           { mr: 'समक्रमण प्रलंबित', hi: 'सिंक लंबित', en: 'Sync pending' },
  accept_show_recycler:          { mr: 'पुनर्वापरकर्त्याला हे दाखवा', hi: 'पुनर्चक्रणकर्ता को यह दिखाएं', en: 'Show this to the recycler' },
  accept_qr_fallback_hint:       { mr: 'स्कॅन न झाल्यास हा कोड सांगा', hi: 'स्कैन न हो तो यह कोड बताएं', en: 'If it does not scan, read out this code' },
  accept_go_now:                 { mr: 'तुम्ही आत्ता जाऊ शकता.', hi: 'आप अभी जा सकते हैं।', en: 'You may go now.' },
  accept_go_now_sub:             { mr: 'स्वीकृती म्हणजे परवानगी नाही — आत्ता जा.', hi: 'स्वीकृति अनुमति नहीं है — अभी जाएं।', en: 'Acceptance is not authorization — go now.' },
  accept_directions:             { mr: 'दिशा दाखवा', hi: 'दिशा दिखाएं', en: 'Show directions' },
  accept_share_location:         { mr: 'पत्ता पाठवा', hi: 'पता भेजें', en: 'Share address' },
  accept_go_home:                { mr: 'मुख्यपृष्ठावर जा', hi: 'मुख्य पृष्ठ पर जाएं', en: 'Go to home' },

  voice_accepted: { mr: 'स्वीकारले', hi: 'स्वीकार किया गया', en: 'Accepted' },

  // ---------------------------------------------------------------------
  // Handover
  // ---------------------------------------------------------------------
  handover_disputed_title:   { mr: 'आक्षेप नोंदवला', hi: 'आपत्ति दर्ज की गई', en: 'Objection recorded' },
  handover_dispute_note:     { mr: 'या रकमेवर तुमची सहमती नाही, असे नोंदवले आहे.', hi: 'यह दर्ज किया गया है कि आप इस राशि पर सहमत नहीं हैं।', en: 'It has been recorded that you do not agree to this amount.' },
  handover_recorded_amount:  { mr: 'नोंदवलेली रक्कम', hi: 'दर्ज की गई राशि', en: 'Recorded amount' },
  handover_confirm_question: { mr: 'ही रक्कम बरोबर आहे का?', hi: 'क्या यह राशि सही है?', en: 'Is this amount correct?' },
  handover_correct:          { mr: 'बरोबर', hi: 'सही', en: 'Correct' },
  handover_wrong:            { mr: 'चूक', hi: 'गलत', en: 'Wrong' },
  handover_qr_hint:          { mr: 'हे QR स्कॅन करा किंवा संदर्भ कोड सांगा', hi: 'यह QR स्कैन करें या संदर्भ कोड बताएं', en: 'Scan this QR or read out the reference code' },
  handover_check_amount:     { mr: 'रक्कम तपासा: ₹{amount}', hi: 'राशि जांचें: ₹{amount}', en: 'Check amount: ₹{amount}' },

  // ---------------------------------------------------------------------
  // Lots (history list)
  // ---------------------------------------------------------------------
  lot_status_awaiting_confirm: { mr: 'पुष्टीची प्रतीक्षा', hi: 'पुष्टि की प्रतीक्षा', en: 'Awaiting confirmation' },
  lot_status_complete:         { mr: 'पूर्ण', hi: 'पूर्ण', en: 'Complete' },
  filter_all:                  { mr: 'सर्व', hi: 'सभी', en: 'All' },
  filter_confirmation_short:   { mr: 'पुष्टी', hi: 'पुष्टि', en: 'Confirmation' },
  lots_view_qr_a11y:           { mr: 'QR कोड पहा', hi: 'QR कोड देखें', en: 'View QR code' },
  lots_tap_for_qr:             { mr: 'QR कोड पाहण्यासाठी टच करा', hi: 'QR कोड देखने के लिए टच करें', en: 'Tap to view QR code' },
  lots_empty_all:              { mr: 'अद्याप कोणतीही नोंद नाही', hi: 'अभी तक कोई प्रविष्टि नहीं', en: 'No entries yet' },
  lots_empty_filtered:         { mr: 'या स्थितीत काहीही नाही', hi: 'इस स्थिति में कुछ भी नहीं', en: 'Nothing in this status' },

  // ---------------------------------------------------------------------
  // Value & ranked recyclers
  // ---------------------------------------------------------------------
  sort_score:              { mr: 'सुचवलेले', hi: 'सुझाया गया', en: 'Suggested' },
  sort_rate:               { mr: 'दर',       hi: 'दर',        en: 'Rate' },
  sort_distance:           { mr: 'अंतर',     hi: 'दूरी',       en: 'Distance' },
  value_offline_prefix:    { mr: 'ऑफलाइन — कॅश डेटा', hi: 'ऑफ़लाइन — कैश्ड डेटा', en: 'Offline — cached data' },
  value_offline_aged:      { mr: '{age} मिनिटे जुना', hi: '{age} मिनट पुराना', en: '{age} minutes old' },
  value_offline_stale:     { mr: 'जुना', hi: 'पुराना', en: 'Stale' },
  value_market_rate_label: { mr: 'बाजार दर:', hi: 'बाजार दर:', en: 'Market rate:' },
  value_best_estimate_label: { mr: 'सर्वोत्तम अंदाजे मूल्य', hi: 'सर्वोत्तम अनुमानित मूल्य', en: 'Best estimated value' },
  value_listen_estimate_a11y: { mr: 'अंदाजे मूल्य ऐका', hi: 'अनुमानित मूल्य सुनें', en: 'Listen to estimated value' },

  // ---------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------
  camera_opening:            { mr: 'कॅमेरा उघडत आहे…', hi: 'कैमरा खुल रहा है…', en: 'Opening camera…' },
  camera_permission_message: { mr: 'कॅमेरा परवानगी आवश्यक आहे', hi: 'कैमरा अनुमति आवश्यक है', en: 'Camera permission is required' },
  camera_grant_permission:   { mr: 'परवानगी द्या', hi: 'अनुमति दें', en: 'Grant permission' },
  camera_view_photo_a11y:    { mr: 'फोटो {n} पहा', hi: 'फ़ोटो {n} देखें', en: 'View photo {n}' },
  camera_select_area:        { mr: 'क्षेत्र निवडा', hi: 'क्षेत्र चुनें', en: 'Select area' },
  camera_pick_gallery_a11y:  { mr: 'गॅलरीतून निवडा', hi: 'गैलरी से चुनें', en: 'Choose from gallery' },
  camera_hint_full:          { mr: 'चारही फोटो झाले — पुढे जा', hi: 'चारों फ़ोटो हो गईं — आगे बढ़ें', en: 'All four photos taken — move on' },
  camera_hint_remaining:     { mr: 'आणखी {count} फोटो घेता येतील', hi: 'आप {count} और फ़ोटो ले सकते हैं', en: 'You can take {count} more photos' },
  camera_remove_photo:       { mr: 'काढून टाका', hi: 'हटाएं', en: 'Remove' },
  camera_back_to_camera:     { mr: 'कॅमेऱ्याकडे परत', hi: 'कैमरे पर वापस जाएं', en: 'Back to camera' },

  // ---------------------------------------------------------------------
  // Sub-category questions
  // ---------------------------------------------------------------------
  subcat_q_pcb:     { mr: 'कोणता बोर्ड?',   hi: 'कौन सा बोर्ड?',   en: 'Which board?' },
  subcat_q_battery: { mr: 'कोणती बॅटरी?',   hi: 'कौन सी बैटरी?',   en: 'Which battery?' },
  subcat_q_panel:   { mr: 'कोणती स्क्रीन?', hi: 'कौन सी स्क्रीन?', en: 'Which screen?' },
  subcat_q_motor:   { mr: 'कोणता भाग?',     hi: 'कौन सा हिस्सा?',  en: 'Which part?' },
  subcat_unknown:   { mr: 'मला माहीत नाही', hi: 'मुझे नहीं पता',   en: "I don't know" },

  // ---------------------------------------------------------------------
  // Category grid
  // ---------------------------------------------------------------------
  select_label:          { mr: 'निवडा', hi: 'चुनें', en: 'Select' },
  category_hint:         { mr: 'नाव ऐकण्यासाठी चित्रावर टच करा · पुढे जाण्यासाठी “निवडा” दाबा', hi: 'नाम सुनने के लिए चित्र पर टच करें · आगे बढ़ने के लिए “चुनें” दबाएं', en: 'Tap the picture to hear the name · press “Select” to continue' },
  category_select_a11y:  { mr: '{name} निवडा', hi: '{name} चुनें', en: 'Select {name}' },

  // ---------------------------------------------------------------------
  // Source
  // ---------------------------------------------------------------------
  source_auto_advance_hint: { mr: 'हे ऐच्छिक आहे — {seconds} सेकंदात आपोआप पुढे जाईल', hi: 'यह वैकल्पिक है — {seconds} सेकंड में अपने आप आगे बढ़ेगा', en: 'This is optional — will auto-advance in {seconds} seconds' },
  source_skip:              { mr: 'वगळा (Skip)', hi: 'छोड़ें (Skip)', en: 'Skip' },

  // ---------------------------------------------------------------------
  // Quantity
  // ---------------------------------------------------------------------
  tap_to_listen: { mr: 'ऐकण्यासाठी टच करा', hi: 'सुनने के लिए टच करें', en: 'Tap to listen' },

  // ---------------------------------------------------------------------
  // Price board
  // ---------------------------------------------------------------------
  price_board_stale:   { mr: 'भाव जुने आहेत', hi: 'दरें पुरानी हैं', en: 'Rates are outdated' },
  price_board_as_of:   { mr: 'भाव: {date}', hi: 'भाव: {date}', en: 'Rates as of: {date}' },
  price_board_loading: { mr: 'भाव लोड होत आहे…', hi: 'भाव लोड हो रहे हैं…', en: 'Loading rates…' },

  // ---------------------------------------------------------------------
  // Authorisation panel — wording is constrained by README ground rule 1:
  // a lapsed MPCB listing must never be phrased as unlawful/banned in any
  // language. See src/components/AuthorisationPanel.jsx.
  // ---------------------------------------------------------------------
  auth_panel_headline: {
    mr: 'MPCB यादीतील {listed} पैकी {valid} पुनर्वापरकर्ते सध्या अधिकृत आहेत — {lapsed} ची यादीतील मुदत संपली असून ते वगळले आहेत.',
    hi: 'MPCB सूची में {listed} में से {valid} पुनर्चक्रणकर्ता वर्तमान में अधिकृत हैं — {lapsed} की सूची अवधि समाप्त हो चुकी है और उन्हें हटा दिया गया है।',
    en: 'Of {listed} recyclers on the MPCB list, {valid} are currently authorised — {lapsed} have an expired listing and have been excluded.',
  },
  auth_panel_provenance: {
    mr: 'स्रोत: MPCB · यादी शेवटची अद्ययावत: {date}',
    hi: 'स्रोत: MPCB · सूची अंतिम बार अपडेट: {date}',
    en: 'Source: MPCB · List last updated: {date}',
  },
  auth_valid_until: { mr: 'वैध पर्यंत {date}', hi: 'वैध तिथि {date} तक', en: 'Valid until {date}' },
};

export default catalogue;
