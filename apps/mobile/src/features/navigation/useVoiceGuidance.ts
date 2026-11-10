import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { speak } from '@/src/features/speech/speak';
import type { RoutePoint, RouteResponse } from '@/src/types/route';
import { usePreferencesStore } from '@/src/stores/preferences-store';

import { buildSteps, distanceMeters } from './routeSteps';

export function useVoiceGuidance(route: RouteResponse | undefined) {
  const [started, setStarted] = useState(false);
  const [arrivedRoute, setArrivedRoute] = useState<RouteResponse>();
  const voiceEnabled = usePreferencesStore((state) => state.voiceGuidance);
  const setVoiceEnabled = usePreferencesStore((state) => state.setVoiceGuidance);
  const [currentLocation, setCurrentLocation] = useState<RoutePoint>();
  const subscription = useRef<Location.LocationSubscription | undefined>(undefined);
  const voiceEnabledRef = useRef(true);
  const lastAnnouncement = useRef<{ route: RouteResponse; stepIndex: number; arrived: boolean } | undefined>(undefined);
  const mounted = useRef(true);
  const starting = useRef(false);
  const announcementId = useRef(0);
  const steps = useMemo(() => (route ? buildSteps(route.geometry) : []), [route]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; subscription.current?.remove(); void Speech.stop(); };
  }, []);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
    if (!voiceEnabled) void Speech.stop();
  }, [voiceEnabled]);

  const announce = useCallback((text: string) => {
    const id = ++announcementId.current;
    void Speech.stop().then(() => {
      if (mounted.current && voiceEnabledRef.current && announcementId.current === id) speak(text);
    });
  }, []);

  const progress = useMemo(() => {
    if (!route?.geometry.length || !currentLocation) {
      return { stepIndex: 0, remainingDistanceM: route?.distance_m ?? 0, reachedDestination: false };
    }
    const destination = route.geometry[route.geometry.length - 1];
    if (distanceMeters(currentLocation, destination) <= 20) {
      return { stepIndex: 0, remainingDistanceM: 0, reachedDestination: true };
    }

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    route.geometry.forEach((routePoint, index) => {
      const distance = distanceMeters(currentLocation, routePoint);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    let remaining = distanceMeters(currentLocation, route.geometry[nearestIndex]);
    for (let index = nearestIndex; index < route.geometry.length - 1; index += 1) {
      remaining += distanceMeters(route.geometry[index], route.geometry[index + 1]);
    }
    return {
      stepIndex: Math.max(0, steps.findIndex((step) => step.pointIndex >= nearestIndex)),
      remainingDistanceM: remaining,
      reachedDestination: false,
    };
  }, [currentLocation, route, steps]);

  if (progress.reachedDestination && arrivedRoute !== route) {
    setArrivedRoute(route);
  }
  const arrived = !!route && (arrivedRoute === route || progress.reachedDestination);
  const { stepIndex } = progress;
  const remainingDistanceM = arrived ? 0 : progress.remainingDistanceM;

  useEffect(() => {
    if (!started || !currentLocation || !route) return;
    const previous = lastAnnouncement.current;
    if (previous?.route === route && previous.arrived === arrived
      && (arrived || previous.stepIndex === stepIndex)) return;
    const instruction = arrived ? '목적지에 도착했습니다.' : steps[stepIndex]?.instruction;
    if (!instruction) return;
    lastAnnouncement.current = { route, stepIndex, arrived };
    announce(instruction);
  }, [announce, arrived, currentLocation, route, started, stepIndex, steps]);

  const startGuidance = async () => {
    if (!route || started || starting.current) return;
    starting.current = true;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;
      if (!mounted.current) return;
      setStarted(true);
      setArrivedRoute(undefined);
      lastAnnouncement.current = undefined;
      announce(`목적지까지 약 ${Math.round(route.distance_m)}미터입니다. 안내를 시작합니다.`);
      const watcher = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: false, distanceInterval: 5, timeInterval: 3000 },
        ({ coords }) => {
          if (mounted.current) setCurrentLocation({ latitude: coords.latitude, longitude: coords.longitude });
        },
      );
      if (mounted.current) subscription.current = watcher;
      else watcher.remove();
    } catch {
      if (mounted.current) {
        setStarted(false);
        Alert.alert('위치 확인 실패', '위치 서비스를 확인하고 안내를 다시 시작해 주세요.');
      }
    } finally { starting.current = false; }
  };

  return { steps, stepIndex, started, arrived, voiceEnabled, setVoiceEnabled, currentLocation, remainingDistanceM, startGuidance, announce };
}
