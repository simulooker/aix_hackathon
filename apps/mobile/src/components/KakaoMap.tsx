import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

import type { BusStop, LiveBus } from '@/src/types/bus';
import type { DisasterZone } from '@/src/types/environment';
import type { HazardReport } from '@/src/types/hazard';
import type { RoutePoint, TransitLeg } from '@/src/types/route';

type KakaoMapProps = {
  center: RoutePoint;
  currentLocation?: RoutePoint;
  origin?: RoutePoint;
  destination?: RoutePoint;
  hazards?: HazardReport[];
  disasters?: DisasterZone[];
  route?: RoutePoint[];
  transitLegs?: TransitLeg[];
  busStops?: BusStop[];
  buses?: LiveBus[];
  onMapPress?: (point: RoutePoint) => void;
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

const KAKAO_BASE_URL = 'https://withyou-105736498036.asia-northeast3.run.app';

export function KakaoMap({
  center,
  currentLocation,
  origin,
  destination,
  hazards = [],
  disasters = [],
  route = [],
  transitLegs = [],
  busStops = [],
  buses = [],
  onMapPress,
  searchRequest,
  onSearchResults,
  recenterRequest,
  style,
}: KakaoMapProps) {
  const apiKey = process.env.EXPO_PUBLIC_KAKAO_MAP_KEY ?? '';
  const [mapError, setMapError] = useState<string>();
  const webViewRef = useRef<WebView>(null);

  // 버스 데이터는 20초마다 바뀌므로 HTML 을 다시 만들지 않고 지도에 주입만 한다.
  // (HTML 을 새로 만들면 WebView 가 통째로 리로드되어 지도가 깜빡인다.)
  const busPayloadRef = useRef({ stops: busStops, buses });
  busPayloadRef.current = { stops: busStops, buses };

  const pushBusLayer = useCallback((payload: { stops: BusStop[]; buses: LiveBus[] }) => {
    const encoded = JSON.stringify(JSON.stringify(payload));
    webViewRef.current?.injectJavaScript(`
      if (window.__withyouBus) {
        var payload = JSON.parse(${encoded});
        window.__withyouBus.setStops(payload.stops);
        window.__withyouBus.setBuses(payload.buses);
      }
      true;
    `);
  }, []);

  useEffect(() => {
    pushBusLayer({ stops: busStops, buses });
  }, [busStops, buses, pushBusLayer]);

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
    const data = JSON.stringify({ center, currentLocation, origin, destination, hazards, disasters, route, transitLegs, searchRequest }).replace(/</g, '\\u003c');
    const safeKey = apiKey.replace(/[&<>"']/g, '');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <style>
    html,body,#map{width:100%;height:100%;margin:0;padding:0;overflow:hidden;background:#e7efeb}
    #status{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;color:#52645e;font:14px sans-serif;text-align:center}
    .bus-stop{width:11px;height:11px;border-radius:50%;background:#1f6feb;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35);cursor:pointer}
    .bus-pin{position:relative;cursor:pointer;font:700 12px/1 -apple-system,BlinkMacSystemFont,sans-serif;white-space:nowrap}
    .bus-pin .body{display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:14px;background:#1f6feb;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.32)}
    .bus-pin .glyph{width:9px;height:11px;border-radius:2px;background:#fff;box-shadow:inset 0 3px 0 #1f6feb,inset 0 5px 0 #fff}
    .bus-pin .tail{position:absolute;left:50%;bottom:-5px;width:0;height:0;margin-left:-5px;
      border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #1f6feb}
    .bus-tip{padding:5px 8px;font:12px sans-serif;white-space:nowrap}
    .disaster-pin{max-width:170px;padding:5px 9px;border:2px solid #fff;border-radius:13px;background:#b42318;color:#fff;
      box-shadow:0 2px 7px rgba(0,0,0,.32);font:800 11px/1.25 -apple-system,BlinkMacSystemFont,sans-serif;text-align:center}
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
    <div class="slope-item"><span class="slope-chip" style="background:#B7E4A8"></span>15° 이하</div>
    <div class="slope-item"><span class="slope-chip" style="background:#63C174"></span>15° 초과~30°</div>
    <div class="slope-item"><span class="slope-chip" style="background:#167C5A"></span>30° 초과</div>
  </div>
  <script>
    const data = ${data};
    const status = document.getElementById('status');
    function send(type, payload) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
    }
    function fail(message) {
      status.style.display = 'flex';
      status.textContent = message;
      send('error', { message });
    }
    window.onerror = function(message) { fail('지도 실행 오류: ' + message); };

    // 버스정류장 / 실시간 버스 오버레이 레이어.
    // React Native 쪽에서 window.__withyouBus.setStops / setBuses 로 갱신한다.
    function createBusLayer(map) {
      const tip = new kakao.maps.InfoWindow({ removable: true });
      let stopOverlays = [];
      const busOverlays = {}; // vehicleNo -> { overlay, label }

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
            element.addEventListener('click', function () {
              openTip(position, escapeHtml(stop.name));
            });
            return new kakao.maps.CustomOverlay({
              map: map, position: position, content: element,
              xAnchor: 0.5, yAnchor: 0.5, zIndex: 3, clickable: true
            });
          });
        },

        setBuses: function (buses) {
          const seen = {};
          (buses || []).forEach(function (bus) {
            if (!bus || !bus.vehicleNo) return;
            seen[bus.vehicleNo] = true;
            const position = new kakao.maps.LatLng(bus.latitude, bus.longitude);
            const existing = busOverlays[bus.vehicleNo];

            if (existing) {
              // 이미 있는 차량은 위치만 옮겨서 깜빡임 없이 움직이게 한다.
              existing.overlay.setPosition(position);
              existing.label.textContent = bus.routeNo || '';
              existing.position = position;
              existing.bus = bus;
              return;
            }

            const element = document.createElement('div');
            element.className = 'bus-pin';
            const body = document.createElement('div');
            body.className = 'body';
            const glyph = document.createElement('span');
            glyph.className = 'glyph';
            const label = document.createElement('span');
            label.textContent = bus.routeNo || '';
            body.appendChild(glyph);
            body.appendChild(label);
            const tail = document.createElement('div');
            tail.className = 'tail';
            element.appendChild(body);
            element.appendChild(tail);

            const entry = { position: position, bus: bus, label: label };
            element.addEventListener('click', function () {
              const detail = entry.bus;
              const parts = [escapeHtml(detail.routeNo) + '번'];
              if (detail.nodeName) parts.push(escapeHtml(detail.nodeName) + ' 부근');
              if (detail.vehicleNo) parts.push(escapeHtml(detail.vehicleNo));
              openTip(entry.position, parts.join('<br/>'));
            });

            entry.overlay = new kakao.maps.CustomOverlay({
              map: map, position: position, content: element,
              xAnchor: 0.5, yAnchor: 1.1, zIndex: 8, clickable: true
            });
            busOverlays[bus.vehicleNo] = entry;
          });

          // 더 이상 내려오지 않는 차량(운행 종료 등)은 지운다.
          Object.keys(busOverlays).forEach(function (vehicleNo) {
            if (seen[vehicleNo]) return;
            busOverlays[vehicleNo].overlay.setMap(null);
            delete busOverlays[vehicleNo];
          });
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

        function currentLocationMarker(point) {
          if (!point) return;
          const position = new kakao.maps.LatLng(point.latitude, point.longitude);
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
          const overlay = new kakao.maps.CustomOverlay({ position, content: wrapper, map, zIndex: 10, yAnchor: 0.72, xAnchor: 0.5 });
          content.addEventListener('click', function () {
            const info = new kakao.maps.InfoWindow({ content: '<div style="padding:5px 8px;white-space:nowrap;font-size:12px">현재 위치</div>' });
            info.setPosition(position);
            info.open(map);
          });
          return overlay;
        }

        currentLocationMarker(data.currentLocation);
        marker(data.origin, '출발지');
        marker(data.destination, '목적지');

        const hazardOverlays = data.hazards.map(function (hazard) {
          const severity = Number(hazard.severity || 0);
          const color = severity >= 0.7 ? '#d92d20' : severity >= 0.4 ? '#f79009' : '#fdb022';
          return new kakao.maps.Circle({
            center: new kakao.maps.LatLng(hazard.latitude, hazard.longitude),
            radius: 7,
            strokeWeight: 2,
            strokeColor: color,
            strokeOpacity: 0.9,
            fillColor: color,
            fillOpacity: 0.85,
            zIndex: 5
          });
        });
        function updateHazardVisibility() {
          const visible = map.getLevel() <= 5;
          hazardOverlays.forEach(function (overlay) { overlay.setMap(visible ? map : null); });
        }
        updateHazardVisibility();
        kakao.maps.event.addListener(map, 'zoom_changed', updateHazardVisibility);

        data.disasters.forEach(function (disaster) {
          const position = new kakao.maps.LatLng(disaster.latitude, disaster.longitude);
          const color = disaster.kind === 'landslide' ? '#7A271A' : '#B42318';
          new kakao.maps.Circle({
            map: map,
            center: position,
            radius: Number(disaster.radius_m || 80),
            strokeWeight: 3,
            strokeColor: color,
            strokeOpacity: 0.95,
            fillColor: color,
            fillOpacity: 0.24,
            zIndex: 7
          });
          const label = document.createElement('div');
          label.className = 'disaster-pin';
          label.textContent = disaster.kind === 'landslide'
            ? '산사태 통제 · ' + disaster.title
            : '침수·재난 통제 · ' + disaster.title;
          new kakao.maps.CustomOverlay({
            map: map, position: position, content: label,
            xAnchor: 0.5, yAnchor: 1.35, zIndex: 9
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
            const degree = hasElevation
              ? Math.atan(Math.abs(lastElevation - firstElevation) / distance) * 180 / Math.PI
              : 0;
            const color = !hasElevation ? '#167C5A' : degree <= 15 ? '#B7E4A8' : degree <= 30 ? '#63C174' : '#167C5A';
            const blockPath = selected.map(function (point) {
              return new kakao.maps.LatLng(point.latitude, point.longitude);
            });
            new kakao.maps.Polyline({ map: map, path: blockPath, strokeWeight: 9, strokeColor: '#FFFFFF', strokeOpacity: 0.72, strokeStyle: strokeStyle });
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
          if (data.transitLegs && data.transitLegs.length) {
            data.transitLegs.forEach(function (leg) {
              const geometry = leg.geometry || [];
              if (geometry.length < 2) return;
              if (leg.mode === 'walk') {
                drawSlopeRoute(geometry, 'shortdot');
              } else {
                const legPath = geometry.map(function (point) { return new kakao.maps.LatLng(point.latitude, point.longitude); });
                new kakao.maps.Polyline({ map: map, path: legPath, strokeWeight: 7, strokeColor: '#1F6FEB', strokeOpacity: 0.92 });
              }
            });
          } else {
            drawSlopeRoute(data.route, 'solid');
          }
          const bounds = new kakao.maps.LatLngBounds();
          path.forEach(function (point) { bounds.extend(point); });
          map.setBounds(bounds, 40, 40, 40, 40);
        }

        kakao.maps.event.addListener(map, 'click', function (event) {
          const point = event.latLng;
          send('press', { latitude: point.getLat(), longitude: point.getLng() });
        });

        window.__withyouBus = createBusLayer(map);
        send('busLayerReady', {});

        if (data.searchRequest && data.searchRequest.query && kakao.maps.services) {
          const places = new kakao.maps.services.Places();
          const searchCenter = data.currentLocation || data.center;
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

            // No nearby result: retry once without radius/location restrictions.
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
  }, [apiKey, center, currentLocation, origin, destination, hazards, disasters, route, transitLegs, searchRequest]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type: string; latitude?: number; longitude?: number; results?: KakaoPlace[] };
      if (message.type === 'ready') {
        setMapError(undefined);
      } else if (message.type === 'busLayerReady') {
        // 지도 HTML 이 다시 만들어지면 버스 오버레이가 사라지므로 현재 상태를 다시 밀어넣는다.
        pushBusLayer(busPayloadRef.current);
      } else if (message.type === 'error') {
        setMapError((message as { message?: string }).message ?? '카카오 지도를 불러오지 못했습니다.');
      } else if (message.type === 'press' && message.latitude != null && message.longitude != null) {
        onMapPress?.({ latitude: message.latitude, longitude: message.longitude });
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
