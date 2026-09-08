import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { colors, spacing } from '../ui/tokens';
import { useStrings } from '../i18n/useStrings';
import { useVoice } from '../hooks/useVoice';
import { uuidv7 } from '@bhaav/core/ids';
import { sha256 } from '../lib/sha256';
import { base64ToBytes } from '../lib/base64';
import { log } from '../lib/logger';

let Location = null;
try { Location = require('expo-location'); } catch {}
let FileSystem = null;
try { FileSystem = require('expo-file-system'); } catch {}

/**
 * HandoverEvidenceScreen — the collector's counter-signature step.
 *
 * The recycler has already created the handover (POST /handover, "Send to
 * Collector") and it is sitting PENDING_COLLECTOR. Before this collector can
 * accept it, the API requires a second, independent photo and GPS fix taken
 * right here, right now — see the confirm_evidence_* checks in
 * server/api/src/routes/handover.js. That is what makes handoverTs +
 * handoverLat/Lng describe the same moment, and it is why the lot's original
 * collection photo/location (from CameraScreen, taken hours or days earlier
 * at pickup) cannot stand in for this one.
 *
 * Unlike CameraScreen (which queues LOT photos for later multipart upload
 * via the outbox), this screen uploads the HANDOVER photo synchronously: the
 * collector is already online here (they just fetched the pending offer),
 * and the API refuses to confirm without an uploaded photo already on file.
 */
export default function HandoverEvidenceScreen({ route, navigation, apiUrl }) {
  const { lotId, finalTotal, onConfirmed } = route.params ?? {};
  const t = useStrings();
  const { speakKey } = useVoice();
  const [permission, requestPermission] = useCameraPermissions();

  const [photoUri, setPhotoUri] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef(null);

  // 'locating' | 'ready' | 'denied' | 'failed'
  const [locationStatus, setLocationStatus] = useState('locating');
  const [location, setLocation] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [error, setError] = useState(null);

  const acquireLocation = useCallback(async () => {
    setLocationStatus('locating');
    try {
      if (!Location) { setLocationStatus('failed'); return; }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocationStatus('denied'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLocationStatus('ready');
      log.handover.info('evidence location acquired', { lotId });
    } catch (err) {
      log.handover.warn('evidence location failed', err);
      setLocationStatus('failed');
    }
  }, [lotId]);

  useEffect(() => { acquireLocation(); }, [acquireLocation]);

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
      setPhotoUri(photo.uri);
      log.handover.info('evidence photo captured', { lotId });
    } catch (err) {
      log.handover.error('evidence capture failed', err);
      setError(t('evidence_upload_failed'));
    } finally {
      setCapturing(false);
    }
  };

  const canSubmit = photoUri != null && locationStatus === 'ready' && !submitting && !disputing;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!FileSystem) throw new Error('file_system_unavailable');

      const base64 = await FileSystem.readAsStringAsync(photoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = base64ToBytes(base64);
      const digest = sha256(bytes);
      const photoId = uuidv7();

      const form = new FormData();
      form.append('photoId', photoId);
      form.append('lotId', lotId);
      form.append('kind', 'HANDOVER');
      form.append('sha256', digest);
      form.append('file', { uri: photoUri, name: `${photoId}.jpg`, type: 'image/jpeg' });

      const uploadRes = await fetch(`${apiUrl}/photos`, { method: 'POST', body: form });
      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({}));
        throw new Error(`photo_upload_failed:${uploadRes.status}:${body.detail ?? ''}`);
      }

      const confirmRes = await fetch(`${apiUrl}/handover/${lotId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handoverLat: location.lat, handoverLng: location.lng }),
      });
      if (!confirmRes.ok) {
        const body = await confirmRes.json().catch(() => ({}));
        throw new Error(`confirm_failed:${confirmRes.status}:${body.error ?? ''}`);
      }

      speakKey('voice_handover_confirmed');
      // onConfirmed (from HandoverScreen's "Correct" flow) flips that
      // still-mounted screen straight to its DONE phase; goBack() then
      // reveals it already showing the confirmed amount. Without a caller
      // (PendingRequestsScreen's inline Agree button), goBack() alone
      // returns to Requests, whose useFocusEffect re-fetches the list.
      onConfirmed?.();
      navigation.goBack();
    } catch (err) {
      log.handover.error('evidence submit failed', err);
      setError(t('evidence_upload_failed'));
      speakKey('voice_error_generic');
    } finally {
      setSubmitting(false);
    }
  };

  // The previous "Cancel" here just navigated back with no server call — a
  // collector who decided the offer was wrong AT this last step (after
  // seeing the amount, before signing) had no way to actually record that;
  // the handover sat PENDING_COLLECTOR forever with nothing to show for it.
  // This mirrors PendingRequestsScreen's Disagree exactly: same confirm
  // dialog, same POST /handover/:lot_id/dispute call.
  const handleDisagree = () => {
    Alert.alert(
      t('dispute_confirm_title'),
      t('dispute_confirm_message', { amount: Math.round(finalTotal ?? 0).toLocaleString('en-IN') }),
      [
        { text: t('dispute_cancel'), style: 'cancel' },
        {
          text: t('dispute_confirm_yes'),
          style: 'destructive',
          onPress: async () => {
            setDisputing(true);
            try {
              const res = await fetch(`${apiUrl}/handover/${lotId}/dispute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              log.handover.warn('collector disputed at evidence step', { lotId });
              speakKey('voice_dispute_recorded');
              navigation.goBack();
            } catch (err) {
              log.handover.error('dispute failed', err);
              speakKey('voice_error_generic');
              setError(t('evidence_upload_failed'));
            } finally {
              setDisputing(false);
            }
          },
        },
      ],
    );
  };

  if (!permission) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

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

  return (
    <Screen style={styles.screen}>
      <Text variant="lg" style={styles.header}>{t('evidence_header')}</Text>
      <Text style={styles.prompt}>{t('evidence_prompt')}</Text>
      {finalTotal != null && (
        <Text style={styles.amount}>₹{Math.round(finalTotal).toLocaleString('en-IN')}</Text>
      )}

      <View style={styles.viewfinder}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        )}
      </View>

      {!photoUri ? (
        <TouchableOpacity
          style={[styles.shutter, capturing && styles.shutterDisabled]}
          onPress={handleCapture}
          disabled={capturing}
          accessibilityRole="button"
          accessibilityLabel={t('camera_prompt')}
        >
          <View style={styles.shutterInner} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.retakeBtn} onPress={() => setPhotoUri(null)} disabled={submitting}>
          <Ionicons name="camera-reverse-outline" size={18} color={colors.primary} />
          <Text style={styles.retakeText}>{t('evidence_retake')}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.locationRow}>
        {locationStatus === 'locating' && (
          <>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.locationText}>{t('evidence_locating')}</Text>
          </>
        )}
        {locationStatus === 'ready' && (
          <>
            <Ionicons name="location" size={16} color={colors.primary} />
            <Text style={styles.locationText}>{t('evidence_location_ready')}</Text>
          </>
        )}
        {(locationStatus === 'denied' || locationStatus === 'failed') && (
          <>
            <Ionicons name="location-outline" size={16} color={colors.danger} />
            <Text style={[styles.locationText, { color: colors.danger }]}>
              {locationStatus === 'denied' ? t('evidence_location_denied') : t('evidence_location_failed')}
            </Text>
            <TouchableOpacity onPress={acquireLocation}>
              <Text style={styles.retryText}>{t('evidence_retry_location')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Button
        title={submitting ? t('evidence_uploading') : t('evidence_confirm_and_agree')}
        onPress={handleSubmit}
        disabled={!canSubmit}
        style={styles.confirmBtn}
      />
      <Button
        title={disputing ? t('waiting') : t('requests_disagree')}
        onPress={handleDisagree}
        variant="danger"
        disabled={submitting || disputing}
        style={styles.cancelBtn}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#000' },
  container: { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center', gap: 16 },
  permMsg: { color: '#fff', fontSize: 16, textAlign: 'center', marginHorizontal: 32 },
  permBtn: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  permBtnText: { color: '#fff', fontWeight: '700' },
  header: { color: '#fff', fontWeight: '700', marginBottom: spacing[1] },
  prompt: { color: 'rgba(255,255,255,0.75)', marginBottom: spacing[2] },
  amount: { color: colors.primaryLight ?? '#81C784', fontWeight: '800', fontSize: 20, marginBottom: spacing[2] },
  viewfinder: {
    flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#111',
    marginBottom: spacing[3],
  },
  shutter: {
    alignSelf: 'center', width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#888',
    marginBottom: spacing[3],
  },
  shutterDisabled: { opacity: 0.4 },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  retakeBtn: {
    flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: spacing[1],
    paddingVertical: spacing[2], paddingHorizontal: spacing[4], marginBottom: spacing[3],
  },
  retakeText: { color: colors.primary, fontWeight: '700' },
  locationRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    marginBottom: spacing[3], minHeight: 22,
  },
  locationText: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  retryText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  errorText: { color: colors.dangerLight ?? '#EF9A9A', marginBottom: spacing[2], fontSize: 13 },
  confirmBtn: { marginBottom: spacing[2] },
  cancelBtn: {},
});
