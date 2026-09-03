import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, FlatList, Image,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
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
  const [previewUri, setPreviewUri] = useState(null);
  const [showCamera, setShowCamera] = useState(true); // toggle viewfinder vs preview
  const cameraRef = useRef(null);

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

  // Take photo with CameraView
  const handleCapture = async () => {
    if (photos.length >= MAX_PHOTOS || !cameraRef.current) return;
    try {
      log.camera.info('taking picture');
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, skipProcessing: true });
      const newPhoto = { uri: photo.uri, capturedAt: new Date().toISOString() };
      setPhotos((prev) => [...prev, newPhoto]);
      setPreviewUri(photo.uri);
      setShowCamera(false); // show preview of shot
      log.camera.info('photo captured', { count: photos.length + 1 });
    } catch (err) {
      log.camera.error('capture failed', err);
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
        const merged = [...photos, ...newPhotos].slice(0, MAX_PHOTOS);
        setPhotos(merged);
        setPreviewUri(merged[merged.length - 1].uri);
        setShowCamera(false);
        log.camera.info('gallery photos picked', { count: result.assets.length });
      }
    } catch (err) {
      log.camera.error('gallery error', err);
    }
  };

  const removePhoto = (index) => {
    const next = photos.filter((_, i) => i !== index);
    setPhotos(next);
    setPreviewUri(next.length > 0 ? next[next.length - 1].uri : null);
    if (next.length === 0) setShowCamera(true);
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
        <Text style={{ color: '#fff' }}>कॅमेरा उघडत आहे…</Text>
      </View>
    );
  }

  // ── Permission denied ────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.permMsg}>📷 कॅमेरा परवानगी आवश्यक आहे</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>परवानगी द्या</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Viewfinder / Preview ─────────────────────────────────────────── */}
      <View style={styles.viewfinder}>
        {showCamera ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
          />
        ) : (
          <Image
            source={{ uri: previewUri ?? photos[photos.length - 1]?.uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        )}

        {/* Torch toggle — only in live view */}
        {showCamera && (
          <TouchableOpacity style={styles.torchBtn} onPress={() => setTorch((v) => !v)}>
            <Text style={styles.torchIcon}>{torch ? '🔦' : '💡'}</Text>
          </TouchableOpacity>
        )}

        {/* "Back to camera" button when previewing */}
        {!showCamera && (
          <TouchableOpacity style={styles.retakeBtn} onPress={() => setShowCamera(true)}>
            <Text style={styles.retakeText}>📷 कॅमेरा</Text>
          </TouchableOpacity>
        )}

        {/* Photo count badge */}
        {photos.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{photos.length}/{MAX_PHOTOS}</Text>
          </View>
        )}
      </View>

      {/* ── Thumbnail strip ──────────────────────────────────────────────── */}
      {photos.length > 0 && (
        <FlatList
          data={photos}
          horizontal
          keyExtractor={(_, i) => String(i)}
          style={styles.strip}
          contentContainerStyle={styles.stripContent}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              onPress={() => { setPreviewUri(item.uri); setShowCamera(false); }}
              onLongPress={() => removePhoto(index)}
            >
              <View style={[styles.thumb, previewUri === item.uri && !showCamera && styles.thumbActive]}>
                <Image source={{ uri: item.uri }} style={styles.thumbImage} resizeMode="cover" />
                <View style={styles.thumbOverlay}>
                  <Text style={styles.thumbNum}>{index + 1}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <View style={styles.controls}>
        {areaPickerVisible && !location && (
          <View style={styles.areaPicker}>
            <Text variant="sm" style={styles.areaLabel}>📍 क्षेत्र निवडा</Text>
            <View style={styles.areaChips}>
              {AREAS.map((a) => (
                <TouchableOpacity
                  key={a}
                  style={[styles.areaChip, selectedArea === a && styles.areaChipSelected]}
                  onPress={() => setSelectedArea(a)}
                >
                  <Text variant="sm" style={selectedArea === a ? styles.areaChipTextSelected : null}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.shutterRow}>
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={handleGallery}
            disabled={photos.length >= MAX_PHOTOS || !ImagePicker}
          >
            <Text style={styles.sideBtnIcon}>🖼️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shutter, photos.length >= MAX_PHOTOS && styles.shutterDisabled]}
            onPress={handleCapture}
            disabled={photos.length >= MAX_PHOTOS}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>

          <View style={styles.sideBtn} />
        </View>

        <Button
          title={`${t('next')} →`}
          onPress={handleNext}
          style={styles.nextBtn}
          disabled={photos.length === 0}
        />
      </View>
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
  torchBtn: { position: 'absolute', top: spacing[4], right: spacing[4], padding: spacing[2], zIndex: 10 },
  torchIcon: { fontSize: 24 },
  retakeBtn: {
    position: 'absolute', top: spacing[4], left: spacing[4],
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, zIndex: 10,
  },
  retakeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  countBadge: {
    position: 'absolute', top: spacing[3], alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
    paddingHorizontal: spacing[2], paddingVertical: 2, zIndex: 10,
  },
  countText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  strip: { height: 80, backgroundColor: '#000' },
  stripContent: { paddingHorizontal: spacing[2], alignItems: 'center' },
  thumb: {
    width: 64, height: 64, margin: 4, borderRadius: 6, overflow: 'hidden',
    borderWidth: 2, borderColor: 'transparent',
  },
  thumbActive: { borderColor: colors.primary },
  thumbImage: { width: '100%', height: '100%' },
  thumbOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 4, paddingVertical: 1,
    borderTopLeftRadius: 4,
  },
  thumbNum: { color: '#fff', fontSize: 10, fontWeight: '700' },
  controls: { backgroundColor: '#000', padding: spacing[4], gap: spacing[3] },
  areaPicker: { marginBottom: spacing[1] },
  areaLabel: { color: '#fff', marginBottom: spacing[2] },
  areaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  areaChip: { paddingHorizontal: spacing[3], paddingVertical: spacing[1], backgroundColor: '#333', borderRadius: 999 },
  areaChipSelected: { backgroundColor: colors.primary },
  areaChipTextSelected: { color: '#fff' },
  shutterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sideBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  sideBtnIcon: { fontSize: 28 },
  shutter: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 4, borderColor: '#888',
  },
  shutterDisabled: { opacity: 0.4 },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  nextBtn: { marginTop: spacing[1] },
});
