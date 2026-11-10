const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(name, mocks = {}) {
  const filename = path.resolve(__dirname, '../src/features/navigation', `${name}.ts`);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = new Module(filename, module);
  mod.require = (id) => Object.hasOwn(mocks, id) ? mocks[id]
    : id === './routeSteps' ? load('routeSteps')
      : id === './liveRoute' ? load('liveRoute') : require(id);
  mod._compile(code, filename);
  return mod.exports;
}
const { projectOnRoute, hazardAhead, isBlockingHazard, testPointAhead } = load('liveRoute');
const route = [{ latitude: 35, longitude: 126 }, { latitude: 35.004, longitude: 126 }];
const position = { latitude: 35.002, longitude: 126 };
test('detects new risk ahead on a sparse segment', () => {
  assert.equal(hazardAhead({ latitude: 35.003, longitude: 126.00005 }, position, route), true);
});
test('ignores passed risk and parallel streets', () => {
  assert.equal(hazardAhead({ latitude: 35.001, longitude: 126 }, position, route), false);
  assert.equal(hazardAhead({ latitude: 35.003, longitude: 126.001 }, position, route), false);
});
test('does not infer progress from GPS far from the route', () => {
  assert.equal(hazardAhead(route[1], { latitude: 35.002, longitude: 126.01 }, route), false);
});
test('test button interpolates ahead instead of using the destination vertex', () => {
  const point = testPointAhead(route, position);
  assert.ok(Math.abs(point.latitude - 35.003) < 0.000001);
  assert.ok(projectOnRoute(point, route).distance < 0.01);
  assert.equal(hazardAhead(point, position, route), true);
});
test('short remaining route cannot receive a demonstration obstacle', () => {
  assert.throws(() => testPointAhead(route, { latitude: 35.0035, longitude: 126 }));
});
test('only active, verified, relevant reports trigger rerouting', () => {
  assert.equal(isBlockingHazard({ is_active: false, severity: 1 }, 'elderly'), false);
  assert.equal(isBlockingHazard({ is_active: true, status: 'pending', severity: 1 }, 'elderly'), false);
  assert.equal(isBlockingHazard({ is_active: true, status: 'verified', severity: 0.8 }, 'elderly'), true);
  assert.equal(isBlockingHazard({ is_active: true, severity: 0.3, hazard_type: 'stairs' }, 'wheelchair'), true);
});

function hookHarness(requestRoute) {
  const effects = [];
  const cleanups = [];
  const original = { route_id: 'session-1', status: 'ready', geometry: route, distance_m: 445,
    hazards_on_route: [], used_fallback_graph: false };
  const state = { route: original, profile: 'wheelchair' };
  const messages = [];
  const { useLiveRerouting } = load('useLiveRerouting', {
    react: { useRef: (value) => ({ current: value }),
      useState: (value) => [value, (next) => { if (typeof next === 'string') messages.push(next); }],
      useEffect: (effect) => effects.push(effect) },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '@/src/services/api': { requestRoute, getNearbyHazards: async () => [] },
    '@/src/stores/route-store': { useRouteStore: { getState: () => state,
      setState: (change) => Object.assign(state, change) } },
    '@/src/stores/preferences-store': { usePreferencesStore: { getState: () => ({ routeProfile: 'wheelchair' }) } },
  });
  const hook = useLiveRerouting(original, route[0], false, () => {});
  effects.forEach((effect) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); });
  return { hook, state, original, messages, dispose: () => cleanups.forEach((cleanup) => cleanup()) };
}
const bypass = { route_id: 'server-new-id', status: 'ready', distance_m: 630,
  used_fallback_graph: false, hazards_on_route: [], geometry: [route[0],
    { latitude: 35, longitude: 126.001 }, { latitude: 35.004, longitude: 126.001 }, route[1]] };

test('photo event uses original wheelchair profile/destination and preserves session URL', async () => {
  let payload;
  const h = hookHarness(async (input) => { payload = input; return bypass; });
  try {
    await h.hook.addTestReport('file://test.png');
    assert.equal(payload.profile, 'wheelchair');
    assert.deepEqual(payload.destination, route[1]);
    assert.equal(payload.blockedPoints.length, 1);
    assert.equal(h.state.route.route_id, 'session-1');
    assert.deepEqual(h.state.route.geometry, bypass.geometry);
  } finally { h.dispose(); }
});
test('failed or unsafe response keeps the last valid route', async () => {
  for (const response of [{ ...bypass, used_fallback_graph: true }, { ...bypass, geometry: route }]) {
    const h = hookHarness(async () => response);
    try {
      await h.hook.addTestReport('file://test.png');
      assert.equal(h.state.route, h.original);
      assert.ok(h.messages.some((message) => message.includes('기존 경로를 유지')));
    } finally { h.dispose(); }
  }
});
test('leaving guidance cancels the request and ignores its late result', async () => {
  let finish;
  let signal;
  const h = hookHarness((input) => { signal = input.signal; return new Promise((resolve) => { finish = resolve; }); });
  const pending = h.hook.addTestReport('file://test.png');
  h.dispose();
  assert.equal(signal.aborted, true);
  finish(bypass);
  await pending;
  assert.equal(h.state.route, h.original);
});
