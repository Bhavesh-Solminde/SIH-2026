import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, FlatList, Image,
  Modal, Animated, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
// expo-image-picker — loaded dynamically once installed
let ImagePicker = null;
try { ImagePicker = require('expo-image-picker'); } catch { /* not installed yet */ }
let Location = null;
try { Location = require('expo-location'); } catch {}
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { colors, spacing } from '../ui/tokens';
import { useStrings } from '../i18n/useStrings';
import { useFocusEffect } from '@react-navigation/native';
import { useVoice } from '../hooks/useVoice';
import { log } from '../lib/logger';

/**
 * S1 — Photograph the material
 * Live CameraView via expo-camera. Shutter takes real photos.
 * Gallery picker via expo-image-picker (once installed).
 *
 * The viewfinder NEVER leaves live mode. Taking a photo used to swap the
 * camera out for a full-bleed still, so the collector had to find a small
 * "कॅमेरा" chip in the top-left corner before they could take the second of
 * four required photos — four shots meant four round trips through a mode
 * they did not ask to enter. It also looked broken: a landscape still
 * letterboxed inside a portrait viewfinder left a wide black band under the
 * image.
 *
 * Now a shot flashes the frame, drops a thumbnail into the strip, and leaves
 * the camera running. Reviewing a photo is a deliberate act — tap its
 * thumbnail — and happens in a modal over the still-live camera, so closing
 * it returns you to a viewfinder that never stopped.
 */

const MAX_PHOTOS = 4;
const AREAS = ['Nalasopara', 'Vasai', 'Virar', 'Bhayandar', 'Thane', 'Mira Road'];

export default function CameraScreen({ navigation, route }) {
  const t = useStrings();
  const { speak } = useVoice();
  const [permission, requestPermission] = useCameraPermissions();

  useFocusEffect(
    useCallback(() => {
      speak(t('camera_prompt'));
    }, [speak, t])
  );
  const [photos, setPhotos] = useState([]);
  const [location, setLocation] = useState(null);
  const [areaPickerVisible, setAreaPickerVisible] = useState(false);
  const [selectedArea, setSelectedArea] = useState(null);
  const [torch, setTorch] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(null); // null = not reviewing
  const cameraRef = useRef(null);
  const flash = useRef(new Animated.Value(0)).current;

  // GPS on mount
  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled && !location) setAreaPickerVisible(true);
    }, 8000);

    (async () => {
      try {
        if (!Location) {
          if (!cancelled) setAreaPickerVisible(true);
          return;
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setAreaPickerVisible(true);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
        });
        if (!cancelled) {
          clearTimeout(timeout);
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          log.camera.info('location acquired', { lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {
        if (!cancelled) setAreaPickerVisible(true);
      }
    })();

    return () => { cancelled = true; clearTimeout(timeout); };
  }, []);

  // A shutter needs to be felt, not just counted. One white pulse over the
  // frame is the whole confirmation — the thumbnail appearing is the receipt.
  const pulseFlash = useCallback(() => {
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  }, [flash]);

  // Take photo with CameraView
  const handleCapture = async () => {
    if (photos.length >= MAX_PHOTOS || !cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      log.camera.info('taking picture');
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, skipProcessing: true });
      pulseFlash();
      setPhotos((prev) => [...prev, { uri: photo.uri, capturedAt: new Date().toISOString() }]);
      log.camera.info('photo captured', { count: photos.length + 1 });
    } catch (err) {
      log.camera.error('capture failed', err);
    } finally {
      setCapturing(false);
    }
  };

  // Open gallery picker
  const handleGallery = async () => {
    if (photos.length >= MAX_PHOTOS || !ImagePicker) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsMultipleSelection: true,
        selectionLimit: MAX_PHOTOS - photos.length,
      });
      if (!result.canceled && result.assets?.length) {
        const newPhotos = result.assets.map((a) => ({ uri: a.uri, capturedAt: new Date().toISOString() }));
        setPhotos((prev) => [...prev, ...newPhotos].slice(0, MAX_PHOTOS));
        log.camera.info('gallery photos picked', { count: result.assets.length });
      }
    } catch (err) {
      log.camera.error('gallery error', err);
    }
  };

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setReviewIndex(null);
  };

  const handleNext = () => {
    navigation.navigate('Category', {
      photos,
      collectionLat: location?.lat ?? null,
      collectionLng: location?.lng ?? null,
      operatingArea: selectedArea ?? null,
      collectionTs: new Date().toISOString(),
    });
  };

  // ── Permission not loaded yet ────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={{ color: '#fff' }}>{t('camera_opening')}</Text>
      </View>
    );
  }

  // ── Permission denied ────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="camera-outline" size={40} color="#fff" />
        <Text style={styles.permMsg}>{t('camera_permission_message')}</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>{t('camera_grant_permission')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const full = photos.length >= MAX_PHOTOS;

  return (
    <View style={styles.container}>
      {/* ── Viewfinder — always live ─────────────────────────────────────── */}
      <View style={styles.viewfinder}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
        />

        {/* Shutter flash */}
        <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flash }]} />

        {/* Torch toggle */}
        <TouchableOpacity style={styles.torchBtn} onPress={() => setTorch((v) => !v)}>
          <Ionicons name={torch ? 'flash' : 'flash-off'} size={22} color="#fff" />
        </TouchableOpacity>

        {/* Photo count badge */}
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{photos.length}/{MAX_PHOTOS}</Text>
        </View>

        {/* Thumbnail strip — floats over the bottom of the live frame so the
            camera keeps the full height instead of being pushed up by a
            second black band. */}
        {photos.length > 0 && (
          <FlatList
            data={photos}
            horizontal
            keyExtractor={(item, i) => `${item.uri}-${i}`}
            style={styles.strip}
            contentContainerStyle={styles.stripContent}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                onPress={() => setReviewIndex(index)}
                accessibilityRole="button"
                accessibilityLabel={t('camera_view_photo_a11y', { n: index + 1 })}
              >
                <View style={styles.thumb}>
                  <Image source={{ uri: item.uri }} style={styles.thumbImage} resizeMode="cover" />
                  <View style={styles.thumbOverlay}>
                    <Text style={styles.thumbNum}>{index + 1}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <View style={styles.controls}>
        {areaPickerVisible && !location && (
          <View style={styles.areaPicker}>
            <View style={styles.areaLabelRow}>
              <Ionicons name="location-outline" size={14} color="#fff" />
              <Text variant="sm" style={styles.areaLabel}>{t('camera_select_area')}</Text>
            </View>
            <View style={styles.areaChips}>
              {AREAS.map((a) => (
                <TouchableOpacity
                  key={a}
                  style={[styles.areaChip, selectedArea === a && styles.areaChipSelected]}
                  onPress={() => setSelectedArea(a)}
                >
                  <Text variant="sm" style={selectedArea === a ? styles.areaChipTextSelected : styles.areaChipText}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.shutterRow}>
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={handleGallery}
            disabled={full || !ImagePicker}
            accessibilityRole="button"
            accessibilityLabel={t('camera_pick_gallery_a11y')}
          >
            <Ionicons name="images-outline" size={26} color={full || !ImagePicker ? 'rgba(255,255,255,0.4)' : '#fff'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shutter, (full || capturing) && styles.shutterDisabled]}
            onPress={handleCapture}
            disabled={full || capturing}
            accessibilityRole="button"
            accessibilityLabel={t('camera_prompt')}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>

          <View style={styles.sideBtn} />
        </View>

        <Text variant="sm" style={styles.hint}>
          {full
            ? t('camera_hint_full')
            : t('camera_hint_remaining', { count: MAX_PHOTOS - photos.length })}
        </Text>

        <Button
          title={`${t('next')} →`}
          onPress={handleNext}
          style={styles.nextBtn}
          disabled={photos.length === 0}
        />
      </View>

      {/* ── Review one photo — over the still-running camera ──────────────── */}
      <Modal
        visible={reviewIndex !== null}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setReviewIndex(null)}
      >
        <View style={styles.reviewRoot}>
          {reviewIndex !== null && photos[reviewIndex] && (
            <Image
              source={{ uri: photos[reviewIndex].uri }}
              style={styles.reviewImage}
              resizeMode="contain"
            />
          )}
          <View style={styles.reviewBar}>
            <TouchableOpacity
              style={styles.reviewBtn}
              onPress={() => removePhoto(reviewIndex)}
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={20} color={colors.dangerLight} />
              <Text style={styles.reviewDeleteText}>{t('camera_remove_photo')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reviewBtn}
              onPress={() => setReviewIndex(null)}
              accessibilityRole="button"
            >
              <Ionicons name="camera-outline" size={20} color="#fff" />
              <Text style={styles.reviewCloseText}>{t('camera_back_to_camera')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center', gap: 16 },
  permMsg: { color: '#fff', fontSize: 16, textAlign: 'center', marginHorizontal: 32 },
  permBtn: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  permBtnText: { color: '#fff', fontWeight: '700' },
  viewfinder: { flex: 1, backgroundColor: '#000', position: 'relative', overflow: 'hidden' },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff', zIndex: 20 },
  torchBtn: {
    position: 'absolute', top: spacing[4], right: spacing[4], padding: spacing[2],
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, zIndex: 10,
  },
  countBadge: {
    position: 'absolute', top: spacing[4], alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
    paddingHorizontal: spacing[3], paddingVertical: 3, zIndex: 10,
  },
  countText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  strip: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    maxHeight: 84, zIndex: 10,
  },
  stripContent: { paddingHorizontal: spacing[2], paddingVertical: spacing[2], alignItems: 'center' },
  thumb: {
    width: 64, height: 64, marginRight: spacing[2], borderRadius: 8, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)',
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 5, paddingVertical: 1,
    borderTopLeftRadius: 4,
  },
  thumbNum: { color: '#fff', fontSize: 11, fontWeight: '700' },
  controls: { backgroundColor: '#000', padding: spacing[4], gap: spacing[3] },
  areaPicker: { marginBottom: spacing[1] },
  areaLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], marginBottom: spacing[2] },
  areaLabel: { color: '#fff' },
  areaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  areaChip: { paddingHorizontal: spacing[3], paddingVertical: spacing[1], backgroundColor: '#333', borderRadius: 999 },
  areaChipSelected: { backgroundColor: colors.primary },
  areaChipText: { color: '#fff' },
  areaChipTextSelected: { color: '#fff', fontWeight: '700' },
  shutterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sideBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  shutter: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 4, borderColor: '#888',
  },
  shutterDisabled: { opacity: 0.4 },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  hint: { color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  nextBtn: { marginTop: spacing[1] },

  reviewRoot: { flex: 1, backgroundColor: '#000' },
  reviewImage: { flex: 1, width: '100%' },
  reviewBar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingVertical: spacing[5], paddingHorizontal: spacing[4], backgroundColor: '#000',
  },
  reviewBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], padding: spacing[3] },
  reviewDeleteText: { color: colors.dangerLight, fontWeight: '700', fontSize: 15 },
  reviewCloseText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
