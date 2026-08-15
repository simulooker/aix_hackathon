import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useRef, useState } from 'react';

import { speak } from '@/src/features/speech/speak';
import type { RoutePoint, RouteResponse } from '@/src/types/route';
import { usePreferencesStore } from '@/src/stores/preferences-store';

import { buildSteps, distanceMeters } from './routeSteps';

export function useVoiceGuidance(route: RouteResponse | undefined) {
  const [stepIndex, setStepIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [arrived, setArrived] = useState(false);
  const voiceEnabled = usePreferencesStore((state) => state.voiceGuidance);
  const setVoiceEnabled = usePreferencesStore((state) => state.setVoiceGuidance);
  const [currentLocation, setCurrentLocation] = useState<RoutePoint>();
  const [remainingDistanceM, setRemainingDistanceM] = useState(route?.distance_m ?? 0);
  const subscription = useRef<Location.LocationSubscription | undefined>(undefined);
  const voiceEnabledRef = useRef(true);
  const announcedStep = useRef(-1);
  const announcedArrival = useRef(false);
  const steps = useMemo(() => (route ? buildSteps(route.geometry) : []), [route]);

  useEffect(() => () => subscription.current?.remove(), []);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
    if (!voiceEnabled) void Speech.stop();
  }, [voiceEnabled]);

  const announce = (text: string) => {
    if (voiceEnabledRef.current) speak(text);
  };

  const updatePosition = (point: RoutePoint) => {
    if (!route) return;
    setCurrentLocation(point);
    const destination = route.geometry[route.geometry.length - 1];
    if (distanceMeters(point, destination) <= 20) {
      setArrived(true);
      if (!announcedArrival.current) {
        announce('목적지에 도착했습니다.');
        announcedArrival.current = true;
      }
      return;
    }

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    route.geometry.forEach((routePoint, index) => {
      const distance = distanceMeters(point, routePoint);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    let remaining = distanceMeters(point, route.geometry[nearestIndex]);
    for (let index = nearestIndex; index < route.geometry.length - 1; index += 1) {
      remaining += distanceMeters(route.geometry[index], route.geometry[index + 1]);
    }
    setRemainingDistanceM(remaining);
    const nextIndex = Math.max(0, steps.findIndex((step) => step.pointIndex >= nearestIndex));
    setStepIndex(nextIndex);
    if (announcedStep.current !== nextIndex && steps[nextIndex]) {
      announce(steps[nextIndex].instruction);
      announcedStep.current = nextIndex;
    }
  };

  const startGuidance = async () => {
    if (!route || started) return;
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return;
    setStarted(true);
    setArrived(false);
    announcedStep.current = -1;
    announce(`목적지까지 약 ${Math.round(route.distance_m)}미터입니다. 안내를 시작합니다.`);
    subscription.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 3000 },
      (location) => updatePosition({ latitude: location.coords.latitude, longitude: location.coords.longitude }),
    );
  };

  return { steps, stepIndex, started, arrived, voiceEnabled, setVoiceEnabled, currentLocation, remainingDistanceM, startGuidance };
}
