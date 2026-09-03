import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, Dimensions, TouchableOpacity } from 'react-native';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useStrings } from '../i18n/useStrings';
import { useFocusEffect } from '@react-navigation/native';
import { useVoice } from '../hooks/useVoice';
import { play } from '../audio';
import { colors, spacing } from '../ui/tokens';

/**
 * A20 — Safety cards
 * Six pictorial cards with audio. Horizontal paginated FlatList.
 * Icon + Marathi sentence + audio button per card.
 * Per the brief: do not burn cables, do not open batteries,
 * handle CRTs carefully, do not use acid on boards.
 * No text-only content — every card has an icon.
 */

const { width: SCREEN_W } = Dimensions.get('window');

const CARDS = [
  {
    id: 'no_fire',
    icon: '🔥🚫',
    mr: 'केबल जाळू नका — विषारी धूर निघतो.',
    hi: 'केबल मत जलाएं — जहरीला धुआं निकलता है।',
    audioClip: 'safety_no_fire',
    bg: '#FFF3E0',
  },
  {
    id: 'battery',
    icon: '🔋⚠️',
    mr: 'बॅटरी उघडू नका — आत ऍसिड असते.',
    hi: 'बैटरी मत खोलें — अंदर एसिड होता है।',
    audioClip: 'safety_battery',
    bg: '#FFF8E1',
  },
  {
    id: 'crt',
    icon: '📺🧤',
    mr: 'CRT टीव्ही काळजीपूर्वक हाताळा — काच जड असते.',
    hi: 'CRT टीवी सावधानी से उठाएं — कांच भारी होता है।',
    audioClip: 'safety_crt',
    bg: '#E8F5E9',
  },
  {
    id: 'no_acid',
    icon: '🧪🚫',
    mr: 'बोर्डवर ऍसिड वापरू नका — ते बेकायदेशीर आहे.',
    hi: 'बोर्ड पर एसिड मत डालें — यह गैरकानूनी है।',
    audioClip: 'safety_no_acid',
    bg: '#FCE4EC',
  },
  {
    id: 'gloves',
    icon: '🧤✅',
    mr: 'हातमोजे घाला — इलेक्ट्रॉनिक कचरा हाताळताना.',
    hi: 'दस्ताने पहनें — इलेक्ट्रॉनिक कचरा उठाते समय।',
    audioClip: 'safety_gloves',
    bg: '#E3F2FD',
  },
  {
    id: 'ventilation',
    icon: '💨🏠',
    mr: 'हवा खेळती ठेवा — बंद खोलीत काम करू नका.',
    hi: 'हवादार जगह पर काम करें — बंद कमरे में नहीं।',
    audioClip: 'safety_ventilation',
    bg: '#F3E5F5',
  },
];

export default function SafetyScreen({ navigation }) {
  const t = useStrings();
  const { speak } = useVoice();
  const [current, setCurrent] = useState(0);

  useFocusEffect(
    useCallback(() => {
      speak(t('safety_title'));
    }, [speak, t])
  );
  const listRef = useRef(null);

  const handleScroll = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setCurrent(idx);
  };

  const handleAudio = (clip) => {
    play(clip).catch(() => {});
  };

  const renderCard = ({ item }) => (
    <View style={[styles.card, { backgroundColor: item.bg, width: SCREEN_W - spacing[8] }]}>
      <Text style={styles.cardIcon}>{item.icon}</Text>
      <Text variant="lg" style={styles.cardText}>{item.mr}</Text>
      <TouchableOpacity
        style={styles.audioBtn}
        onPress={() => handleAudio(item.audioClip)}
        accessibilityLabel="ऐका"
      >
        <Text style={styles.audioBtnText}>🔊 ऐका</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Screen style={styles.container}>
      <Text variant="lg" style={styles.title}>{t('safety_title')}</Text>

      <FlatList
        ref={listRef}
        data={CARDS}
        renderItem={renderCard}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.listContent}
        style={styles.list}
      />

      {/* Dot indicators */}
      <View style={styles.dots}>
        {CARDS.map((_, i) => (
          <View key={i} style={[styles.dot, i === current && styles.dotActive]} />
        ))}
      </View>

      <Text variant="sm" style={styles.hint}>
        {current + 1} / {CARDS.length} — स्वाइप करा
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontWeight: '700', padding: spacing[4] },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing[4] },
  card: {
    marginHorizontal: spacing[2], borderRadius: 20,
    padding: spacing[6], alignItems: 'center', justifyContent: 'center',
    minHeight: 320,
  },
  cardIcon: { fontSize: 72, marginBottom: spacing[6] },
  cardText: { textAlign: 'center', fontWeight: '600', lineHeight: 28 },
  audioBtn: {
    marginTop: spacing[6], backgroundColor: '#fff',
    paddingHorizontal: spacing[5], paddingVertical: spacing[3],
    borderRadius: 999, flexDirection: 'row', alignItems: 'center',
  },
  audioBtnText: { fontWeight: '600', fontSize: 18 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing[2], paddingVertical: spacing[3] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gray200 },
  dotActive: { backgroundColor: colors.primary, width: 20 },
  hint: { textAlign: 'center', color: colors.textSecondary, paddingBottom: spacing[4] },
});
