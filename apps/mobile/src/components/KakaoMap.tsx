import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

import type { HazardReport } from '@/src/types/hazard';
import type { RoutePoint } from '@/src/types/route';

type KakaoMapProps = {
  center: RoutePoint;
  currentLocation?: RoutePoint;
  origin?: RoutePoint;
  destination?: RoutePoint;
  hazards?: HazardReport[];
  route?: RoutePoint[];
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
  route = [],
  onMapPress,
  searchRequest,
  onSearchResults,
  recenterRequest,
  style,
}: KakaoMapProps) {
  const apiKey = process.env.EXPO_PUBLIC_KAKAO_MAP_KEY ?? '';
  const [mapError, setMapError] = useState<string>();
  const webViewRef = useRef<WebView>(null);

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
    const data = JSON.stringify({ center, currentLocation, origin, destination, hazards, route, searchRequest }).replace(/</g, '\\u003c');
    const safeKey = apiKey.replace(/[&<>"']/g, '');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <style>
    html,body,#map{width:100%;height:100%;margin:0;padding:0;overflow:hidden;background:#e7efeb}
    #status{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;color:#52645e;font:14px sans-serif;text-align:center}
  </style>
</head>
<body>
  <div id="status">카카오 지도를 불러오는 중입니다.</div>
  <div id="map"></div>
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

        marker(data.currentLocation, '현재 위치');
        marker(data.origin, '출발지');
        marker(data.destination, '목적지');

        data.hazards.forEach(function (hazard) {
          const severity = Number(hazard.severity || 0);
          const color = severity >= 0.7 ? '#d92d20' : severity >= 0.4 ? '#f79009' : '#fdb022';
          new kakao.maps.Circle({
            map,
            center: new kakao.maps.LatLng(hazard.latitude, hazard.longitude),
            radius: 6,
            strokeWeight: 2,
            strokeColor: color,
            strokeOpacity: 0.9,
            fillColor: color,
            fillOpacity: 0.85,
            zIndex: 5
          });
        });

        if (data.route.length > 1) {
          const path = data.route.map(function (point) { return new kakao.maps.LatLng(point.latitude, point.longitude); });
          new kakao.maps.Polyline({ map, path, strokeWeight: 6, strokeColor: '#167C5A', strokeOpacity: 0.9 });
          const bounds = new kakao.maps.LatLngBounds();
          path.forEach(function (point) { bounds.extend(point); });
          map.setBounds(bounds, 40, 40, 40, 40);
        }

        kakao.maps.event.addListener(map, 'click', function (event) {
          const point = event.latLng;
          send('press', { latitude: point.getLat(), longitude: point.getLng() });
        });

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
  }, [apiKey, center, currentLocation, origin, destination, hazards, route, searchRequest]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type: string; latitude?: number; longitude?: number; results?: KakaoPlace[] };
      if (message.type === 'ready') {
        setMapError(undefined);
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
