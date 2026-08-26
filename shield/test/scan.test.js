'use strict';

const assert = require('node:assert');
const { join } = require('node:path');
const { scan } = require('../src/scan');

const FIXTURES = join(__dirname, 'fixtures');

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
};

(async () => {
  const result = await scan(FIXTURES);
  const at = (method, path) => result.routes.find((r) => r.method === method && r.path === path);
  const flowIds = (route) => (route ? route.flows.map((f) => f.id).sort() : null);

  check('finds every route across both files', () => {
    assert.strictEqual(result.routes.length, 11, `got ${result.routes.length}: ${result.routes.map((r) => `${r.method} ${r.path}`).join(', ')}`);
  });

  check('does not flag a correctly parameterised query', () => {
    const route = at('GET', '/api/orders/:id');
    assert.ok(route, 'route should exist');
    assert.ok(!flowIds(route).includes('sql'), 'bound parameters are not an injection');
    assert.deepStrictEqual(route.reads, ['req.params.id']);
  });

  check('flags a mutating route reached by id with no authorisation', () => {
    const route = at('DELETE', '/shop/orders/:id');
    const finding = route.flows.find((f) => f.id === 'missing-authorization');
    assert.ok(finding, `no finding on ${JSON.stringify(flowIds(route))}`);
    assert.strictEqual(finding.severity, 'high');
    assert.strictEqual(finding.call, 'no middleware');
  });

  check('rates the read-only equivalent lower, not the same', () => {
    const finding = at('GET', '/shop/orders/:id').flows.find((f) => f.id === 'missing-authorization');
    assert.ok(finding);
    assert.strictEqual(finding.severity, 'medium');
  });

  check('finds the gap even when the query is parameterised', () => {
    const route = at('GET', '/shop/orders/:id');
    assert.ok(!flowIds(route).includes('sql'), 'query is parameterised');
    assert.ok(route.sinksReached.includes('sql'), 'but the route still reaches the database');
    assert.ok(route.flows.some((f) => f.id === 'missing-authorization'));
  });

  check('stays quiet when an auth-shaped guard is present', () => {
    const route = at('PATCH', '/shop/profile');
    assert.ok(!flowIds(route).includes('missing-authorization'), 'requireSession should satisfy it');
  });

  check('does not treat express.json() as an authorisation check', () => {
    const finding = at('DELETE', '/shop/orders/:id').flows.find((f) => f.id === 'missing-authorization');
    assert.ok(!/json/.test(finding.call), `express.json() leaked into guards: ${finding.call}`);
  });

  check('flags a whole request body handed to a model', () => {
    const finding = at('POST', '/shop/orders').flows.find((f) => f.id === 'mass-assignment');
    assert.ok(finding, `no finding on ${JSON.stringify(flowIds(at('POST', '/shop/orders')))}`);
    assert.strictEqual(finding.call, 'new Order()');
    assert.deepStrictEqual(finding.origins, ['req.body']);
  });

  check('flags mass assignment through an ORM update too', () => {
    const finding = at('PATCH', '/shop/profile').flows.find((f) => f.id === 'mass-assignment');
    assert.ok(finding);
    assert.strictEqual(finding.call, 'User.update()');
  });

  check('does not flag a named field as mass assignment', () => {
    const route = at('POST', '/admin/run');
    assert.ok(!flowIds(route).includes('mass-assignment'), 'req.body.command is a chosen field');
  });

  check('finds a live credential committed to source', () => {
    assert.strictEqual(result.secrets.length, 1, JSON.stringify(result.secrets));
    assert.strictEqual(result.secrets[0].kind, 'stripe-key');
    assert.strictEqual(result.secrets[0].severity, 'critical');
    assert.match(result.secrets[0].file, /orders\.js$/);
  });

  check('resolves the cross-file mount prefix', () => {
    assert.ok(at('GET', '/api/users/:id'), 'router routes should be prefixed with /api');
    assert.ok(at('POST', '/api/users/:id/avatar'));
    assert.ok(at('GET', '/api/search'));
  });

  check('records guards that run before the handler', () => {
    assert.deepStrictEqual(at('GET', '/api/users/:id').guards, ['requireSession']);
    assert.deepStrictEqual(at('POST', '/admin/run').guards, ['requireAdmin']);
    assert.deepStrictEqual(at('GET', '/health').guards, []);
  });

  check('traces destructured params into a concatenated query', () => {
    const route = at('GET', '/api/users/:id');
    assert.deepStrictEqual(flowIds(route), ['sql']);
    assert.strictEqual(route.flows[0].severity, 'critical');
    assert.deepStrictEqual(route.flows[0].origins, ['req.params.id']);
  });

  check('finds both sinks on the avatar route', () => {
    const route = at('POST', '/api/users/:id/avatar');
    assert.deepStrictEqual(flowIds(route), ['filesystem', 'ssrf']);
    const ssrf = route.flows.find((f) => f.id === 'ssrf');
    assert.deepStrictEqual(ssrf.origins, ['req.body.url']);
    const fsFlow = route.flows.find((f) => f.id === 'filesystem');
    assert.deepStrictEqual(fsFlow.origins, ['req.params.id']);
    assert.strictEqual(fsFlow.call, 'fs.writeFileSync');
  });

  check('follows a template literal into exec', () => {
    const route = at('POST', '/admin/run');
    assert.ok(flowIds(route).includes('command'), `got ${flowIds(route)}`);
    const command = route.flows.find((f) => f.id === 'command');
    assert.strictEqual(command.severity, 'critical');
    assert.deepStrictEqual(command.origins, ['req.body.command']);
  });

  check('treats parseInt as a sanitiser', () => {
    const route = at('GET', '/page/:id');
    assert.ok(!flowIds(route).includes('sql'), 'parseInt should stop the taint reaching db.query');
    assert.deepStrictEqual(route.reads, ['req.params.id']);
  });

  check('flags reflected output at low severity', () => {
    const route = at('GET', '/api/search');
    assert.deepStrictEqual(flowIds(route), ['reflect']);
    assert.strictEqual(route.flows[0].severity, 'low');
  });

  check('reports a clean route as clean', () => {
    const route = at('GET', '/health');
    assert.deepStrictEqual(route.flows, []);
    assert.deepStrictEqual(route.reads, []);
  });


  check('parses every fixture without error', () => {
    assert.deepStrictEqual(result.errors, []);
  });

  console.log(`${passed} passed${process.exitCode ? '' : ', 0 failed'}`);
})();
