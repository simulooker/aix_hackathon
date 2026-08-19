import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

import type { BusStop } from '@/src/types/bus';
import type { DisasterZone } from '@/src/types/environment';
import type { HazardReport } from '@/src/types/hazard';
import type { RoutePoint } from '@/src/types/route';

type KakaoMapProps = {
  center: RoutePoint;
  currentLocation?: RoutePoint;
  origin?: RoutePoint;
  destination?: RoutePoint;
  hazards?: HazardReport[];
  disasters?: DisasterZone[];
  route?: RoutePoint[];
  busStops?: BusStop[];
  onMapPress?: (point: RoutePoint) => void;
  onMapLongPress?: (point: RoutePoint) => void;
  onViewportChange?: (viewport: MapViewport) => void;
  onHazardPress?: (hazard: HazardReport) => void;
  searchRequest?: { query: string; requestId: number };
  onSearchResults?: (results: KakaoPlace[]) => void;
  recenterRequest?: number;
  style?: StyleProp<ViewStyle>;
};

export type KakaoPlace = {
  id: string;
  name: string;
  address: string;
  roadAddress: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceM?: number;
};

export type MapViewport = {
  center: RoutePoint;
  level: number;
};

const KAKAO_BASE_URL = 'https://withyou-105736498036.asia-northeast3.run.app';

export function KakaoMap({
  center,
  currentLocation,
  origin,
  destination,
  hazards = [],
  disasters = [],
  route = [],
  busStops = [],
  onMapPress,
  onMapLongPress,
  onViewportChange,
  onHazardPress,
  searchRequest,
  onSearchResults,
  recenterRequest,
  style,
}: KakaoMapProps) {
  const apiKey = process.env.EXPO_PUBLIC_KAKAO_MAP_KEY ?? '';
  const [mapError, setMapError] = useState<string>();
  const webViewRef = useRef<WebView>(null);

  const busPayloadRef = useRef({ stops: busStops });
  busPayloadRef.current = { stops: busStops };
  const hazardPayloadRef = useRef(hazards);
  hazardPayloadRef.current = hazards;
  const locationPayloadRef = useRef(currentLocation);
  locationPayloadRef.current = currentLocation;

  const pushBusLayer = useCallback((payload: { stops: BusStop[] }) => {
    const encoded = JSON.stringify(JSON.stringify(payload));
    webViewRef.current?.injectJavaScript(`
      if (window.__withyouBus) {
        var payload = JSON.parse(${encoded});
        window.__withyouBus.setStops(payload.stops);
      }
      true;
    `);
  }, []);

  const pushHazardLayer = useCallback((payload: HazardReport[]) => {
    const encoded = JSON.stringify(JSON.stringify(payload));
    webViewRef.current?.injectJavaScript(`
      if (window.__withyouHazards) {
        window.__withyouHazards.setHazards(JSON.parse(${encoded}));
      }
      true;
    `);
  }, []);

  const pushCurrentLocation = useCallback((point?: RoutePoint) => {
    if (!point) return;
    webViewRef.current?.injectJavaScript(`
      if (window.__withyouLocation) {
        window.__withyouLocation.setLocation(${point.latitude}, ${point.longitude});
      }
      true;
    `);
  }, []);

  useEffect(() => {
    pushBusLayer({ stops: busStops });
  }, [busStops, pushBusLayer]);

  useEffect(() => {
    pushHazardLayer(hazards);
  }, [hazards, pushHazardLayer]);

  useEffect(() => {
    pushCurrentLocation(currentLocation);
  }, [currentLocation, pushCurrentLocation]);

  useEffect(() => {
    if (!recenterRequest || !currentLocation) return;
    webViewRef.current?.injectJavaScript(`
      if (window.__withyouMap && window.kakao && window.kakao.maps) {
        window.__withyouMap.setCenter(new window.kakao.maps.LatLng(${currentLocation.latitude}, ${currentLocation.longitude}));
        window.__withyouMap.setLevel(4);
      }
      true;
    `);
  }, [currentLocation, recenterRequest]);

  const html = useMemo(() => {
    const data = JSON.stringify({
      center,
      searchCenter: locationPayloadRef.current ?? center,
      origin,
      destination,
      disasters,
      route,
      searchRequest,
    }).replace(/</g, '\\u003c');
    const safeKey = apiKey.replace(/[&<>"']/g, '');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <style>
    html,body,#map{width:100%;height:100%;margin:0;padding:0;overflow:hidden;background:#e7efeb}
    #status{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;color:#52645e;font:14px sans-serif;text-align:center}
    .bus-stop{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:9px;
      background:#fff;border:2px solid #1f6feb;box-shadow:0 2px 5px rgba(0,0,0,.3);cursor:pointer;font-size:17px;line-height:1}
    .bus-tip{padding:5px 8px;font:12px sans-serif;white-space:nowrap}
    .hazard-touch-box{width:56px;height:56px;display:flex;align-items:center;justify-content:center;
      background:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent}
    .hazard-marker{width:22px;height:22px;padding:0;border:3px solid #ffffff;border-radius:50%;
      box-shadow:0 2px 7px rgba(0,0,0,.45);pointer-events:none;box-sizing:border-box}
    .disaster-warning{display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none}
    .disaster-warning-icon{line-height:0;filter:drop-shadow(0 2px 5px rgba(0,0,0,.45))}
    .disaster-warning-text{max-width:150px;padding:2px 8px;border-radius:9px;background:rgba(20,37,31,.88);color:#fff;
      font:800 10px/1.35 -apple-system,BlinkMacSystemFont,sans-serif;text-align:center;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #slope-legend{position:fixed;top:12px;left:12px;z-index:20;display:none;flex-direction:column;gap:4px;
      padding:7px 9px;border-radius:10px;background:rgba(255,255,255,.93);box-shadow:0 2px 7px rgba(0,0,0,.18);
      color:#40534c;font:700 10px/1.2 -apple-system,BlinkMacSystemFont,sans-serif}
    .slope-item{display:flex;align-items:center;gap:5px}.slope-chip{width:18px;height:5px;border-radius:3px}
  </style>
</head>
<body>
  <div id="status">카카오 지도를 불러오는 중입니다.</div>
  <div id="map"></div>
  <div id="slope-legend">
    <div class="slope-item"><span class="slope-chip" style="background:#FACC15"></span>주의 · 약 1.1~2.9° (2~5%)</div>
    <div class="slope-item"><span class="slope-chip" style="background:#F79009"></span>힘듦 · 약 2.9~4.8° (5~8.3%)</div>
    <div class="slope-item"><span class="slope-chip" style="background:#D92D20"></span>매우 힘듦 · 약 4.8~7.1° (8.3~12.5%)</div>
    <div class="slope-item"><span class="slope-chip" style="background:#292524"></span>통행 곤란 추정 · 약 7.1° 이상 (12.5%+)</div>
  </div>
  <script>
    const data = ${data};
    const status = document.getElementById('status');
    let hazardClickLock = false;

    function send(type, payload) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
    }
    function fail(message) {
      status.style.display = 'flex';
      status.textContent = message;
      send('error', { message });
    }
    window.onerror = function(message) { fail('지도 실행 오류: ' + message); };

    function createBusLayer(map) {
      const tip = new kakao.maps.InfoWindow({ removable: true });
      let stopOverlays = [];

      function openTip(position, text) {
        tip.setContent('<div class="bus-tip">' + text + '</div>');
        tip.setPosition(position);
        tip.open(map);
      }

      function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
        });
      }

      return {
        setStops: function (stops) {
          stopOverlays.forEach(function (overlay) { overlay.setMap(null); });
          stopOverlays = (stops || []).map(function (stop) {
            const position = new kakao.maps.LatLng(stop.latitude, stop.longitude);
            const element = document.createElement('div');
            element.className = 'bus-stop';
            element.textContent = '🚌';
            
            function handleStopSelect(e) {
              if (e) {
                e.stopPropagation();
                if (e.preventDefault) e.preventDefault();
              }
              hazardClickLock = true;
              openTip(position, escapeHtml(stop.name));
              setTimeout(function() { hazardClickLock = false; }, 500);
            }

            element.addEventListener('click', handleStopSelect);
            element.addEventListener('touchend', handleStopSelect);

            return new kakao.maps.CustomOverlay({
              map: map.getLevel() <= 4 ? map : null, position: position, content: element,
              xAnchor: 0.5, yAnchor: 0.5, zIndex: 3, clickable: true
            });
          });
        },

        refreshStopVisibility: function () {
          const visible = map.getLevel() <= 4;
          stopOverlays.forEach(function (overlay) { overlay.setMap(visible ? map : null); });
        }
      };
    }

    function createHazardLayer(map) {
      const overlays = {};
      return {
        setHazards: function (hazards) {
          const seen = {};
          (hazards || []).forEach(function (hazard) {
            if (!hazard || !hazard.id) return;
            seen[hazard.id] = true;
            const severity = Number(hazard.severity || 0);
            const color = severity >= 0.7 ? '#D92D20' : severity >= 0.4 ? '#F79009' : '#FDB022';
            const position = new kakao.maps.LatLng(hazard.latitude, hazard.longitude);
            const existing = overlays[hazard.id];
            
            if (existing) {
              existing.overlay.setPosition(position);
              existing.dot.style.background = color;
              return;
            }
            
            const touchBox = document.createElement('div');
            touchBox.className = 'hazard-touch-box';
            
            const dot = document.createElement('div');
            dot.className = 'hazard-marker';
            dot.style.background = color;
            touchBox.appendChild(dot);

            function handleHazardSelect(event) {
              if (event) {
                event.stopPropagation();
                if (event.preventDefault) event.preventDefault();
              }
              hazardClickLock = true;
              send('hazardPress', { hazardId: hazard.id });
              setTimeout(function() { hazardClickLock = false; }, 500);
            }

            touchBox.addEventListener('click', handleHazardSelect);
            touchBox.addEventListener('touchend', handleHazardSelect);

            overlays[hazard.id] = {
              touchBox: touchBox,
              dot: dot,
              overlay: new kakao.maps.CustomOverlay({
                map: map,
                position: position,
                content: touchBox,
                xAnchor: 0.5,
                yAnchor: 0.5,
                zIndex: 35,
                clickable: true
              })
            };
          });

          Object.keys(overlays).forEach(function (hazardId) {
            if (seen[hazardId]) return;
            overlays[hazardId].overlay.setMap(null);
            delete overlays[hazardId];
          });
        },
        refreshVisibility: function () {
          Object.keys(overlays).forEach(function (hazardId) {
            overlays[hazardId].overlay.setMap(map);
          });
        }
      };
    }

    function createLocationLayer(map) {
      let position;
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;white-space:nowrap;';
      const label = document.createElement('div');
      label.textContent = '내 위치';
      label.style.cssText = 'padding:2px 6px;border-radius:8px;background:rgba(255,255,255,.94);color:#C62828;font:800 10px sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.2);';
      const content = document.createElement('button');
      content.type = 'button';
      content.title = '현재 위치';
      content.setAttribute('aria-label', '현재 위치');
      content.style.cssText = 'width:24px;height:24px;padding:0;border:3px solid #E53935;border-radius:50%;background:#fff;box-shadow:0 2px 7px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;box-sizing:border-box;';
      const centerDot = document.createElement('span');
      centerDot.style.cssText = 'display:block;width:9px;height:9px;border-radius:50%;background:#E53935;';
      content.appendChild(centerDot);
      wrapper.appendChild(label);
      wrapper.appendChild(content);
      const overlay = new kakao.maps.CustomOverlay({ content: wrapper, map: null, zIndex: 10, yAnchor: 0.72, xAnchor: 0.5 });
      
      const handleLocationClick = function (e) {
        if (!position) return;
        if (e) {
          e.stopPropagation();
          if (e.preventDefault) e.preventDefault();
        }
        hazardClickLock = true;
        const info = new kakao.maps.InfoWindow({ content: '<div style="padding:5px 8px;white-space:nowrap;font-size:12px">현재 위치</div>' });
        info.setPosition(position);
        info.open(map);
        setTimeout(function() { hazardClickLock = false; }, 500);
      };

      content.addEventListener('click', handleLocationClick);
      content.addEventListener('touchend', handleLocationClick);

      return {
        setLocation: function (latitude, longitude) {
          position = new kakao.maps.LatLng(latitude, longitude);
          overlay.setPosition(position);
          overlay.setMap(map);
        }
      };
    }

    function startMap() {
      if (!window.kakao || !window.kakao.maps) {
        fail('카카오 지도 SDK를 불러오지 못했습니다. 키와 허용 도메인을 확인해 주세요.');
        return;
      }
      kakao.maps.load(function () {
        status.style.display = 'none';
        send('ready', {});
        const center = new kakao.maps.LatLng(data.center.latitude, data.center.longitude);
        const map = new kakao.maps.Map(document.getElementById('map'), { center, level: 4 });
        window.__withyouMap = map;

        function marker(point, title) {
          if (!point) return;
          const position = new kakao.maps.LatLng(point.latitude, point.longitude);
          const item = new kakao.maps.Marker({ position, map });
          if (title) {
            const info = new kakao.maps.InfoWindow({ content: '<div style="padding:5px 8px;white-space:nowrap;font-size:12px">' + title + '</div>' });
            kakao.maps.event.addListener(item, 'click', function () { info.open(map, item); });
          }
        }

        marker(data.origin, '출발지');
        marker(data.destination, '목적지');

        data.disasters.forEach(function (disaster) {
          const position = new kakao.maps.LatLng(disaster.latitude, disaster.longitude);
          const color = disaster.kind === 'landslide' ? '#7A271A' : '#B42318';
          // 통제 범위는 파선 원으로만 옅게 깔고, 표식은 삼각 경고 아이콘으로 세운다.
          // (제보 위험은 원형 점이므로 재난과 형태가 겹치지 않게 구분한다.)
          new kakao.maps.Circle({
            map: map,
            center: position,
            radius: Number(disaster.radius_m || 80),
            strokeWeight: 2,
            strokeColor: color,
            strokeOpacity: 0.75,
            strokeStyle: 'shortdash',
            fillColor: color,
            fillOpacity: 0.13,
            zIndex: 7
          });

          const warning = document.createElement('div');
          warning.className = 'disaster-warning';

          const icon = document.createElement('div');
          icon.className = 'disaster-warning-icon';
          icon.style.color = color;
          icon.innerHTML = '<svg width="36" height="32" viewBox="0 0 36 32" xmlns="http://www.w3.org/2000/svg">'
            + '<path d="M18 3 L34 29 L2 29 Z" fill="currentColor" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>'
            + '<rect x="16.3" y="12" width="3.4" height="9.6" rx="1.7" fill="#ffffff"/>'
            + '<circle cx="18" cy="25.2" r="2" fill="#ffffff"/>'
            + '</svg>';

          const caption = document.createElement('span');
          caption.className = 'disaster-warning-text';
          caption.textContent = disaster.kind === 'landslide'
            ? '산사태 통제 · ' + disaster.title
            : '재난 통제 · ' + disaster.title;

          warning.appendChild(icon);
          warning.appendChild(caption);
          new kakao.maps.CustomOverlay({
            map: map, position: position, content: warning,
            xAnchor: 0.5, yAnchor: 1.1, zIndex: 9
          });
        });

        function horizontalDistance(left, right) {
          const toRadians = function (value) { return value * Math.PI / 180; };
          const latitudeDelta = toRadians(right.latitude - left.latitude);
          const longitudeDelta = toRadians(right.longitude - left.longitude);
          const value = Math.sin(latitudeDelta / 2) ** 2
            + Math.cos(toRadians(left.latitude)) * Math.cos(toRadians(right.latitude))
            * Math.sin(longitudeDelta / 2) ** 2;
          return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
        }

        function drawSlopeRoute(points, strokeStyle) {
          if (!points || points.length < 2) return;
          let block = [points[0]];
          let blockDistance = 0;
          function drawBlock(selected, distance) {
            if (selected.length < 2) return;
            const firstElevation = Number(selected[0].elevation);
            const lastElevation = Number(selected[selected.length - 1].elevation);
            const hasElevation = Number.isFinite(firstElevation) && Number.isFinite(lastElevation) && distance > 0;
            const gradePercent = hasElevation
              ? Math.abs(lastElevation - firstElevation) / distance * 100
              : 0;
            const color = !hasElevation || gradePercent < 2
              ? '#167C5A'
              : gradePercent < 5
              ? '#FACC15'
              : gradePercent < 8.3
              ? '#F79009'
              : gradePercent < 12.5
              ? '#D92D20'
              : '#292524';
            const blockPath = selected.map(function (point) {
              return new kakao.maps.LatLng(point.latitude, point.longitude);
            });
            new kakao.maps.Polyline({ map: map, path: blockPath, strokeWeight: 6, strokeColor: color, strokeOpacity: 0.96, strokeStyle: strokeStyle });
          }
          for (let index = 1; index < points.length; index += 1) {
            const point = points[index];
            blockDistance += horizontalDistance(points[index - 1], point);
            block.push(point);
            if (blockDistance >= 50 || index === points.length - 1) {
              drawBlock(block, blockDistance);
              block = [point];
              blockDistance = 0;
            }
          }
        }

        if (data.route.length > 1) {
          document.getElementById('slope-legend').style.display = 'flex';
          const path = data.route.map(function (point) { return new kakao.maps.LatLng(point.latitude, point.longitude); });
          drawSlopeRoute(data.route, 'solid');
          const bounds = new kakao.maps.LatLngBounds();
          path.forEach(function (point) { bounds.extend(point); });
          map.setBounds(bounds, 40, 40, 40, 40);
        }

        let suppressMapClickUntil = 0;
        const mapContainer = document.getElementById('map');
        let longPressTimer;
        let longPressStart;

        function cancelLongPress() {
          if (longPressTimer) clearTimeout(longPressTimer);
          longPressTimer = undefined;
          longPressStart = undefined;
        }

        mapContainer.addEventListener('pointerdown', function (event) {
          if (event.button != null && event.button !== 0) return;
          const target = event.target;
          if (target && target.closest && target.closest('button,.hazard-touch-box,.bus-stop')) return;
          cancelLongPress();
          longPressStart = { x: event.clientX, y: event.clientY };
          longPressTimer = setTimeout(function () {
            if (!longPressStart || hazardClickLock) return;
            const bounds = mapContainer.getBoundingClientRect();
            const containerPoint = new kakao.maps.Point(
              longPressStart.x - bounds.left,
              longPressStart.y - bounds.top
            );
            const point = map.getProjection().coordsFromContainerPoint(containerPoint);
            suppressMapClickUntil = Date.now() + 1000;
            if (navigator.vibrate) navigator.vibrate(35);
            send('longPress', { latitude: point.getLat(), longitude: point.getLng() });
            cancelLongPress();
          }, 700);
        }, true);

        mapContainer.addEventListener('pointermove', function (event) {
          if (!longPressStart) return;
          if (Math.hypot(event.clientX - longPressStart.x, event.clientY - longPressStart.y) > 10) {
            cancelLongPress();
          }
        }, true);
        mapContainer.addEventListener('pointerup', cancelLongPress, true);
        mapContainer.addEventListener('pointercancel', cancelLongPress, true);
        kakao.maps.event.addListener(map, 'dragstart', cancelLongPress);

        kakao.maps.event.addListener(map, 'click', function (event) {
          if (hazardClickLock || Date.now() < suppressMapClickUntil) return;
          const point = event.latLng;
          send('press', { latitude: point.getLat(), longitude: point.getLng() });
        });

        window.__withyouBus = createBusLayer(map);
        window.__withyouHazards = createHazardLayer(map);
        window.__withyouLocation = createLocationLayer(map);
        send('busLayerReady', {});
        send('hazardLayerReady', {});
        send('locationLayerReady', {});

        function sendViewport() {
          const mapCenter = map.getCenter();
          send('viewport', {
            latitude: mapCenter.getLat(),
            longitude: mapCenter.getLng(),
            level: map.getLevel()
          });
        }
        sendViewport();
        kakao.maps.event.addListener(map, 'idle', sendViewport);
        kakao.maps.event.addListener(map, 'zoom_changed', function () {
          window.__withyouBus.refreshStopVisibility();
          window.__withyouHazards.refreshVisibility();
        });

        if (data.searchRequest && data.searchRequest.query && kakao.maps.services) {
          const places = new kakao.maps.services.Places();
          const searchCenter = data.searchCenter || data.center;
          const query = data.searchRequest.query.trim().toLocaleLowerCase();

          function distanceMeters(latitude, longitude) {
            const earthRadius = 6371000;
            const toRadians = function (value) { return value * Math.PI / 180; };
            const latitudeDelta = toRadians(latitude - searchCenter.latitude);
            const longitudeDelta = toRadians(longitude - searchCenter.longitude);
            const value = Math.sin(latitudeDelta / 2) ** 2
              + Math.cos(toRadians(searchCenter.latitude)) * Math.cos(toRadians(latitude))
              * Math.sin(longitudeDelta / 2) ** 2;
            return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
          }

          function sendRankedResults(results) {
            const ranked = results.map(function (place) {
              const name = place.place_name.trim().toLocaleLowerCase();
              const latitude = Number(place.y);
              const longitude = Number(place.x);
              const distance = place.distance ? Number(place.distance) : distanceMeters(latitude, longitude);
              let matchRank = 3;
              if (name === query) matchRank = 0;
              else if (name.startsWith(query)) matchRank = 1;
              else if (name.includes(query)) matchRank = 2;
              return { place: place, matchRank: matchRank, distance: distance };
            }).sort(function (a, b) {
              return a.matchRank - b.matchRank || a.distance - b.distance;
            });
            send('searchResults', { results: ranked.map(function (item) {
                const place = item.place;
                return {
                  id: place.id,
                  name: place.place_name,
                  address: place.address_name,
                  roadAddress: place.road_address_name,
                  category: place.category_name,
                  latitude: Number(place.y),
                  longitude: Number(place.x),
                  distanceM: Math.round(item.distance)
                };
              }) });
          }

          places.keywordSearch(data.searchRequest.query, function (results, searchStatus) {
            if (searchStatus === kakao.maps.services.Status.OK && results.length) {
              sendRankedResults(results);
              return;
            }
            if (searchStatus !== kakao.maps.services.Status.ZERO_RESULT) {
              send('searchResults', { results: [] });
              return;
            }

            places.keywordSearch(data.searchRequest.query, function (nationwideResults, nationwideStatus) {
              if (nationwideStatus === kakao.maps.services.Status.OK) {
                sendRankedResults(nationwideResults);
              } else {
                send('searchResults', { results: [] });
              }
            }, { size: 15 });
          }, {
            size: 15,
            location: new kakao.maps.LatLng(searchCenter.latitude, searchCenter.longitude),
            radius: 20000,
            sort: kakao.maps.services.SortBy.DISTANCE
          });
        }
      });
    }
    if (!'${safeKey}') {
      fail('카카오 지도 JavaScript 키가 설정되지 않았습니다.');
    } else {
      const script = document.createElement('script');
      script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=${safeKey}&autoload=false&libraries=services';
      script.onload = startMap;
      script.onerror = function() { fail('카카오 지도 서버에 연결하지 못했습니다.'); };
      document.head.appendChild(script);
    }
  </script>
</body>
</html>`;
  }, [apiKey, center, origin, destination, disasters, route, searchRequest]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        type: string;
        latitude?: number;
        longitude?: number;
        level?: number;
        hazardId?: string;
        results?: KakaoPlace[];
      };
      if (message.type === 'ready') {
        setMapError(undefined);
      } else if (message.type === 'busLayerReady') {
        pushBusLayer(busPayloadRef.current);
      } else if (message.type === 'hazardLayerReady') {
        pushHazardLayer(hazardPayloadRef.current);
      } else if (message.type === 'locationLayerReady') {
        pushCurrentLocation(locationPayloadRef.current);
      } else if (message.type === 'error') {
        setMapError((message as { message?: string }).message ?? '카카오 지도를 불러오지 못했습니다.');
      } else if (message.type === 'press' && message.latitude != null && message.longitude != null) {
        onMapPress?.({ latitude: message.latitude, longitude: message.longitude });
      } else if (message.type === 'longPress' && message.latitude != null && message.longitude != null) {
        onMapLongPress?.({ latitude: message.latitude, longitude: message.longitude });
      } else if (message.type === 'viewport' && message.latitude != null && message.longitude != null && message.level != null) {
        onViewportChange?.({
          center: { latitude: message.latitude, longitude: message.longitude },
          level: message.level,
        });
      } else if (message.type === 'hazardPress' && message.hazardId) {
        const hazard = hazardPayloadRef.current.find((item) => item.id === message.hazardId);
        if (hazard) onHazardPress?.(hazard);
      } else if (message.type === 'searchResults') {
        onSearchResults?.(message.results ?? []);
      }
    } catch {
      // Ignore malformed messages from the embedded map.
    }
  };

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        style={styles.webview}
        source={{ html, baseUrl: KAKAO_BASE_URL }}
        originWhitelist={['https://*']}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        onError={(event) => setMapError(event.nativeEvent.description)}
        onHttpError={(event) => setMapError(`지도 서버 오류 (${event.nativeEvent.statusCode})`)}
      />
      {mapError && <Text style={styles.error}>{mapError}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: '#E7EFEB' },
  error: {
    position: 'absolute',
    top: 90,
    left: 20,
    right: 20,
    padding: 12,
    borderRadius: 10,
    color: '#B42318',
    backgroundColor: '#FFF3F1',
    textAlign: 'center',
  },
});
