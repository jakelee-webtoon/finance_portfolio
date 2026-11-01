const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transform } = require('sucrase');

const root = path.resolve(__dirname, '..');
class Timestamp {
  constructor(ms) { this.ms = ms; }
  static fromDate(date) { return new Timestamp(date.getTime()); }
  toMillis() { return this.ms; }
  toDate() { return new Date(this.ms); }
}

// No Firebase SDK, credentials, network, or on-disk user storage enters this harness.
function device(server, initial = new Map()) {
  const cache = new Map();
  const events = [];
  const storage = new Map(initial);
  const control = { failWrite: false, failRead: false, failAfterCommit: false, readGate: null, beforeTransaction: null, writes: 0, reads: 0 };
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  const snapshot = ref => ({ ref, id: ref.path.split('/').at(-1), exists: () => server.has(ref.path), data: () => server.get(ref.path) });
  const firebase = {
    Timestamp: Timestamp,
    doc: (_db, collectionPath, id) => ({ path: `${collectionPath}/${id}` }),
    collection: (_db, collectionPath) => ({ path: collectionPath }),
    query: ref => ref,
    orderBy: () => null,
    getDocFromServer: async ref => {
      control.reads++;
      if (control.readGate) await control.readGate;
      if (control.failRead) throw new Error('mock read failed');
      return snapshot(ref);
    },
    getDocsFromServer: async ref => {
      control.reads++;
      if (control.readGate) await control.readGate;
      if (control.failRead) throw new Error('mock read failed');
      return { docs: [...server.keys()].filter(key => key.startsWith(`${ref.path}/`)).map(key => snapshot({ path: key })) };
    },
    setDoc: async (ref, data) => {
      if (control.failWrite) throw new Error('mock offline');
      control.writes++;
      server.set(ref.path, data);
    },
    runTransaction: async (_db, work) => {
      if (control.failWrite) throw new Error('mock offline');
      if (control.beforeTransaction) control.beforeTransaction();
      const writes = [];
      await work({
        get: async ref => snapshot(ref),
        set: (ref, value) => writes.push(() => server.set(ref.path, value)),
        delete: ref => writes.push(() => server.delete(ref.path)),
      });
      writes.forEach(write => write());
      control.writes += writes.length;
      if (control.failAfterCommit) throw new Error('mock acknowledgement lost');
    },
    writeBatch: () => { throw new Error('legacy batch path must not run'); },
  };
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} };
    cache.set(filename, mod);
    const source = transform(fs.readFileSync(filename, 'utf8'), { transforms: ['typescript', 'imports'], filePath: filename }).code;
    const requireMock = request => {
      if (request === 'firebase/firestore') return firebase;
      if (request === './firebase') return { db: {} };
      const target = request.startsWith('@/') ? path.join(root, request.slice(2)) : path.resolve(path.dirname(filename), request);
      return load(`${target}.ts`);
    };
    const context = { module: mod, exports: mod.exports, require: requireMock, localStorage, Date, Map, Set, Promise, Error,
      console: { log() {}, error() {} },
      CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
      window: { dispatchEvent: event => events.push(event) },
    };
    vm.runInNewContext(source, context, { filename });
    return mod.exports;
  }
  return { load, store: load(path.join(root, 'lib/store.ts')), firestore: () => load(path.join(root, 'lib/firestore.ts')), control, events, storage };
}
const row = (id, amount = 100) => ({ id, name: id, amount, category: 'cash', currency: 'KRW', owner: 'husband', source_type: 'manual', as_of_date: '2026-11-01', last_modified_by: 'husband' });
const documentPath = (collection, id) => `users/default/${collection}/${id}`;
const seed = (server, collection, item) => {
  const { id, ...data } = item;
  server.set(documentPath(collection, id), { ...data, ...(data.date ? { date: Timestamp.fromDate(new Date(data.date)) } : {}), as_of_date: Timestamp.fromDate(new Date(item.as_of_date)) });
};
const plain = value => JSON.parse(JSON.stringify(value));

for (const [collection, save, get] of [
  ['assets', 'saveAssets', 'getAssets'],
  ['liabilities', 'saveLiabilities', 'getLiabilities'],
  ['stockHoldings', 'saveStockHoldings', 'getStockHoldings'],
  ['ledgerEntries', 'saveLedgerEntries', 'getLedgerEntries'],
]) {
  test(`${collection}: stale devices preserve independent add/update/delete and CRUD`, async () => {
    const server = new Map();
    const base = { ...row('original'), date: '2026-11-01' };
    seed(server, collection, base);
    const a = device(server); const b = device(server);
    await a.store.syncFromFirebase({ force: true }); await b.store.syncFromFirebase({ force: true });
    assert.equal(await a.store[save]([row('partner-added')]), true);
    assert.equal(await b.store[save]([{ ...base, amount: 200 }]), true);
    assert.equal(server.get(documentPath(collection, 'partner-added')).amount, 100);
    assert.equal(server.get(documentPath(collection, 'original')).amount, 200);
    await a.store.syncFromFirebase({ force: true });
    assert.equal(await a.store[save]([], ['partner-added']), true);
    // B still has an older view of partner-added: editing original cannot restore it.
    assert.equal(await b.store[save]([{ ...base, amount: 300 }]), true);
    assert.equal(server.has(documentPath(collection, 'partner-added')), false);
    assert.equal(await b.store[save]([], ['original']), true);
    assert.equal(server.has(documentPath(collection, 'original')), false);
    assert.equal(b.store[get]().length, 0);
  });
}

test('failed save emits feedback, protects cache on refresh and reload, then retries', async () => {
  const server = new Map(); seed(server, 'assets', row('a'));
  const a = device(server); await a.store.syncFromFirebase({ force: true });
  a.control.failWrite = true;
  assert.equal(await a.store.saveAssets([{ ...row('a'), amount: 250 }]), false);
  assert.equal(a.events.at(-1).detail, 'mock offline');
  assert.equal(a.store.hasPendingSaves(), true);
  await a.store.syncFromFirebase({ force: true });
  assert.equal(a.store.getAssets()[0].amount, 250);
  assert.equal(server.get(documentPath('assets', 'a')).amount, 100);
  const reloaded = device(server, a.storage);
  await reloaded.store.syncFromFirebase({ force: true });
  assert.equal(reloaded.store.getAssets()[0].amount, 250);
  assert.equal(await reloaded.store.retryPendingSaves(), true);
  assert.equal(reloaded.store.hasPendingSaves(), false);
  assert.equal(server.get(documentPath('assets', 'a')).amount, 250);
});

test('lost acknowledgement is retryable without duplicating or losing data', async () => {
  const server = new Map(); const a = device(server);
  a.control.failAfterCommit = true;
  assert.equal(await a.store.saveAssets([row('a')]), false);
  assert.equal(server.size, 1);
  a.control.failAfterCommit = false;
  assert.equal(await a.store.retryPendingSaves(), true);
  assert.equal(server.size, 1);
  assert.equal(a.store.hasPendingSaves(), false);
});

test('same-item edits and deletes reject stale data, including explicit form baseline', async () => {
  const server = new Map(); seed(server, 'assets', row('a'));
  const a = device(server); const b = device(server);
  await a.store.syncFromFirebase({ force: true }); await b.store.syncFromFirebase({ force: true });
  const displayed = b.store.getAssets();
  assert.equal(await a.store.saveAssets([{ ...row('a'), amount: 200 }]), true);
  // A form opened before refresh must still use its original baseline.
  await b.store.syncFromFirebase({ force: true });
  assert.equal(await b.store.saveAssets([{ ...row('a'), amount: 300 }], [], displayed), false);
  assert.equal(server.get(documentPath('assets', 'a')).amount, 200);
  assert.match(b.events.at(-1).detail, /다른 기기/);
  assert.equal(await b.store.retryPendingSaves(), false);
  assert.equal(await b.store.discardPendingSaves(), true);
  assert.equal(b.store.getAssets()[0].amount, 200);
  assert.equal(await a.store.saveAssets([], ['a']), true);
  assert.equal(await b.store.saveAssets([{ ...row('a'), amount: 400 }]), false);
  assert.equal(server.has(documentPath('assets', 'a')), false);
});

test('failed reload after discarding preserves pending edits', async () => {
  const server = new Map(); seed(server, 'assets', row('a'));
  const a = device(server); await a.store.syncFromFirebase({ force: true });
  a.control.failWrite = true;
  await a.store.saveAssets([{ ...row('a'), amount: 250 }]);
  a.control.failRead = true;
  assert.equal(await a.store.discardPendingSaves(), false);
  assert.equal(a.store.hasPendingSaves(), true);
  assert.equal(a.store.getAssets()[0].amount, 250);
});

test('server read failure is distinguishable; stale apartment entry performs no write', async () => {
  const server = new Map(); seed(server, 'assets', row('a', 999));
  const staleCache = new Map([['finance-assets', JSON.stringify([row('a', 1)])]]);
  const a = device(server, staleCache);
  a.control.failRead = true;
  assert.equal(await a.store.syncFromFirebase({ force: true }), false);
  assert.equal(a.control.writes, 0);
  a.control.failRead = false;
  assert.equal(await a.store.syncFromFirebase({ force: true }), true);
  assert.equal(a.store.getAssets()[0].amount, 999);
  assert.equal(a.control.writes, 0); // server reads never create settings as a side effect
});

test('legacy IDs, dates, optional fields and sample-looking real holdings remain intact', async () => {
  const server = new Map();
  const holding = { ...row('stock-1'), name: '삼성전자', symbol: '005930', quantity: 50, purchasePrice: 60000, customLegacyField: 'keep', notes: 'remove me' };
  seed(server, 'stockHoldings', holding);
  const a = device(server); await a.store.syncFromFirebase({ force: true });
  assert.equal(a.store.getStockHoldings().length, 1);
  assert.equal(await a.store.saveStockHoldings([{ ...holding, notes: undefined, quantity: 51 }]), true);
  const data = server.get(documentPath('stockHoldings', 'stock-1'));
  assert.equal(data.quantity, 51);
  assert.equal(data.customLegacyField, 'keep');
  assert.equal('notes' in data, false);
  assert.equal(data.as_of_date.toDate().toISOString().slice(0, 10), '2026-11-01');
  assert.equal('revision' in data, false);
  assert.equal('id' in data, false);
});

test('legacy whole-list save and migration cannot modify server documents', async () => {
  const server = new Map(); seed(server, 'assets', row('a'));
  const a = device(server);
  await assert.rejects(a.store.setAssets([]), /비활성화/);
  await assert.rejects(a.firestore().setAssets([]), /비활성화/);
  assert.equal(server.has(documentPath('assets', 'a')), true);
  assert.equal(a.control.writes, 0);
});

test('dashboard preference failures are visible and retryable', async () => {
  const server = new Map(); const a = device(server);
  a.control.failWrite = true;
  const settings = { baseMonth: '2026-11', scope: 'wife', householdName: '우리집' };
  assert.equal(await a.store.setDashboardState(settings), false);
  await a.store.syncFromFirebase({ force: true });
  assert.deepEqual(plain(a.store.getDashboardState()), settings);
  assert.equal(a.store.hasPendingSaves(), true);
  a.control.failWrite = false;
  assert.equal(await a.store.retryPendingSaves(), true);
  assert.deepEqual(plain(server.get('users/default/settings/dashboard')), settings);
});

// Execute the actual apartment page effects with a tiny isolated hook host.
// This tests the page's write timing, not a second implementation of its policy.
function apartmentPage(a, page = 'apartment') {
  const slots = []; let cursor = 0; let effects = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useEffect: (effect, deps) => {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => value !== slots[index].deps[i])) {
        const previous = slots[index];
        slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
    useMemo: calculate => calculate(),
    useCallback: callback => callback,
    useRef: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
  };
  const mod = { exports: {} };
  const filename = path.join(root, `app/${page}/page.tsx`);
  const source = transform(fs.readFileSync(filename, 'utf8'), { transforms: ['typescript', 'jsx', 'imports'], filePath: filename }).code;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, React: react,
    require: request => {
      if (request === 'react') return react;
      if (request === 'recharts') return {};
      if (request.startsWith('@/lib/') && request !== '@/lib/store') return a.load(path.join(root, request.slice(2)) + '.ts');
      if (request === '@/lib/store') return a.store;
      if (request === '@/hooks/useAuth') return { useAuth: () => true };
      if (request === '@/hooks/useModalDismiss') return { useModalDismiss() {} };
      if (request === '@/components/Table' || request === '@/components/MobileHelp') return { default: () => null };
      throw new Error(`Unexpected page dependency ${request}`);
    },
    window: { addEventListener() {}, removeEventListener() {} }, Date, console,
  }, { filename });
  return async function render() {
    cursor = 0; effects = [];
    const tree = mod.exports.default();
    effects.forEach(effect => effect());
    await new Promise(resolve => setImmediate(resolve));
    return tree;
  };
}

test('actual apartment page never saves stale cache before reads, nor duplicates unchanged assets', async () => {
  const server = new Map();
  const apartment = { ...row('apt-a'), apartmentName: '우리집', dong: '1', ho: '101', purchasePrice: 500, currentPrice: 999 };
  const asset = { ...row('asset-apt-apt-a', 999), name: '아파트', category: 'real_estate' };
  seed(server, 'apartments', apartment); seed(server, 'assets', asset);
  server.set('users/default/settings/dashboard', { baseMonth: '2026-11', scope: 'combined', householdName: '우리집' });
  const a = device(server, new Map([
    ['finance-apartments', JSON.stringify([{ ...apartment, currentPrice: 1 }])],
    ['finance-assets', JSON.stringify([{ ...asset, amount: 1 }])],
  ]));
  let release;
  a.control.readGate = new Promise(resolve => { release = resolve; });
  const render = apartmentPage(a);
  await render(); await render();
  assert.equal(a.control.writes, 0);
  assert.equal(server.get(documentPath('assets', asset.id)).amount, 999);
  release();
  await new Promise(resolve => setImmediate(resolve));
  await render(); await render();
  assert.equal(a.store.getApartments()[0].currentPrice, 999);
  assert.equal(a.control.writes, 0);
});

test('actual apartment page repairs a changed linked asset once, retaining existing document IDs', async () => {
  const server = new Map();
  const apartment = { ...row('apt-a'), apartmentName: '우리집', dong: '1', ho: '101', purchasePrice: 500, currentPrice: 999 };
  const asset = { ...row('legacy-asset-id', 500), name: '우리집 (1동 101호)', category: 'real_estate' };
  seed(server, 'apartments', apartment); seed(server, 'assets', asset);
  server.set('users/default/settings/dashboard', { baseMonth: '2026-11', scope: 'combined', householdName: '우리집' });
  const a = device(server); const render = apartmentPage(a);
  await render(); await render(); await render(); await render();
  assert.equal(server.get(documentPath('assets', 'legacy-asset-id')).amount, 999);
  assert.equal(server.has(documentPath('assets', 'asset-apt-apt-a')), false);
  assert.equal(a.control.writes, 1);
  await render();
  assert.equal(a.control.writes, 1);
  const anotherVisit = device(server);
  const renderAgain = apartmentPage(anotherVisit);
  await renderAgain(); await renderAgain(); await renderAgain();
  assert.equal(anotherVisit.control.writes, 0);
  assert.equal(server.has(documentPath('assets', 'asset-apt-apt-a')), false);
});

test('disabled migration is inert even when called directly', async () => {
  const server = new Map(); seed(server, 'assets', row('a'));
  const a = device(server);
  const result = await a.load(path.join(root, 'lib/migrateToFirebase.ts')).migrateToFirebase();
  assert.equal(result.success, false);
  assert.equal(a.control.writes, 0);
  assert.equal(server.size, 1);
});

test('editing a pending item keeps its original baseline and retries the newest intent', async () => {
  const server = new Map(); seed(server, 'assets', row('a'));
  const a = device(server); await a.store.syncFromFirebase({ force: true });
  a.control.failWrite = true;
  assert.equal(await a.store.saveAssets([{ ...row('a'), amount: 200 }]), false);
  assert.equal(await a.store.saveAssets([{ ...row('a'), amount: 300 }]), false);
  assert.equal(a.store.getPendingSaves().assets.length, 1);
  assert.equal(a.store.getPendingSaves().assets[0].before.amount, 100);
  a.control.failWrite = false;
  assert.equal(await a.store.retryPendingSaves(), true);
  assert.equal(server.get(documentPath('assets', 'a')).amount, 300);
});

test('deleting while offline remains deleted locally through refresh and retry', async () => {
  const server = new Map(); seed(server, 'assets', row('a'));
  const a = device(server); await a.store.syncFromFirebase({ force: true });
  a.control.failWrite = true;
  assert.equal(await a.store.saveAssets([], ['a']), false);
  await a.store.syncFromFirebase({ force: true });
  assert.equal(a.store.getAssets().length, 0);
  a.control.failWrite = false;
  assert.equal(await a.store.retryPendingSaves(), true);
  assert.equal(server.has(documentPath('assets', 'a')), false);
});

test('legacy timestamp times and missing optional dates do not require a schema migration', async () => {
  const server = new Map();
  seed(server, 'stockHoldings', row('legacy'));
  server.get(documentPath('stockHoldings', 'legacy')).as_of_date = Timestamp.fromDate(new Date('2026-11-01T12:34:56Z'));
  const a = device(server); await a.store.syncFromFirebase({ force: true });
  assert.equal(await a.store.saveStockHoldings([{ ...a.store.getStockHoldings()[0], amount: 200 }]), true);
  const missingDate = { ...row('no-date') }; delete missingDate.id; delete missingDate.as_of_date;
  server.set(documentPath('stockHoldings', 'no-date'), missingDate);
  await a.store.syncFromFirebase({ force: true });
  const holding = a.store.getStockHoldings().find(item => item.id === 'no-date');
  assert.equal(await a.store.saveStockHoldings([{ ...holding, amount: 300 }]), true);
});

test('a conflicting source cannot save linked derived assets during retry', async () => {
  const server = new Map(); seed(server, 'apartments', row('apt')); seed(server, 'assets', row('asset'));
  const a = device(server); await a.store.syncFromFirebase({ force: true });
  seed(server, 'apartments', row('apt', 500)); // partner edited the source
  assert.equal(await a.store.saveApartments([row('apt', 200)]), false);
  assert.equal(await a.store.saveAssets([row('asset', 200)]), false);
  assert.equal(server.get(documentPath('assets', 'asset')).amount, 100);
  assert.equal(server.get(documentPath('apartments', 'apt')).amount, 500);
  assert.equal(await a.store.retryPendingSaves(), false);
});

test('apartment automatic sync checks that its source was not changed after the initial read', async () => {
  const server = new Map();
  const apartment = { ...row('apt-a'), apartmentName: '우리집', dong: '1', ho: '101', purchasePrice: 500, currentPrice: 999 };
  const asset = { ...row('asset-apt-apt-a', 500), name: '아파트', category: 'real_estate' };
  seed(server, 'apartments', apartment); seed(server, 'assets', asset);
  const a = device(server);
  a.control.beforeTransaction = () => seed(server, 'apartments', { ...apartment, currentPrice: 2000 });
  const render = apartmentPage(a);
  await render(); await render(); await render();
  assert.equal(server.get(documentPath('assets', asset.id)).amount, 500);
  assert.equal(a.control.writes, 0);
  assert.equal(a.store.hasPendingSaves(), true);
});

test('an unchanged form still verifies the server before reporting success', async () => {
  const server = new Map(); seed(server, 'assets', row('a'));
  const a = device(server); await a.store.syncFromFirebase({ force: true });
  seed(server, 'assets', row('a', 999));
  assert.equal(await a.store.saveAssets([row('a')]), false);
  assert.equal(server.get(documentPath('assets', 'a')).amount, 999);
});

test('reverse apartment link verifies its asset source and preserves unknown legacy fields', async () => {
  const server = new Map();
  const asset = row('legacy-asset');
  const apartment = { ...row('apt'), currentPrice: 100, legacyField: 'preserve' };
  seed(server, 'assets', asset); seed(server, 'apartments', apartment);
  const a = device(server); await a.store.syncFromFirebase({ force: true });
  assert.equal(await a.store.saveAssetApartment(asset, { ...apartment, currentPrice: 200 }, [apartment]), true);
  assert.equal(server.get(documentPath('apartments', 'apt')).legacyField, 'preserve');
  seed(server, 'assets', { ...asset, amount: 500 });
  assert.equal(await a.store.saveAssetApartment(asset, { ...apartment, currentPrice: 300 }, [{ ...apartment, currentPrice: 200 }]), false);
  assert.equal(server.get(documentPath('apartments', 'apt')).currentPrice, 200);
});

test('actual ledger page waits for the server and preserves an edited recurring bill', async () => {
  const server = new Map();
  const previous = { ...row('fixed-source'), date: '2026-10-01', month: '2026-10', type: 'expense_fixed', category: 'insurance', is_fixed: true, payment_method: 'transfer' };
  const current = { ...previous, id: 'ledger-fixed-2026-11-fixed-source', month: '2026-11', date: '2026-11-01', amount: 200 };
  seed(server, 'ledgerEntries', previous); seed(server, 'ledgerEntries', current);
  server.set('users/default/settings/dashboard', { baseMonth: '2026-11', scope: 'combined', householdName: '우리집' });
  const a = device(server, new Map([['finance-ledger-entries', JSON.stringify([previous])]]));
  let release;
  a.control.readGate = new Promise(resolve => { release = resolve; });
  const render = apartmentPage(a, 'ledger');
  await render(); await render();
  assert.equal(a.control.writes, 0);
  release();
  await new Promise(resolve => setImmediate(resolve));
  await render(); await render();
  assert.equal(a.control.writes, 0);
  assert.equal(a.store.getLedgerEntries().length, 2);
  assert.equal(server.get(documentPath('ledgerEntries', current.id)).amount, 200);
});

test('actual ledger page creates a missing recurring bill once with stable ID', async () => {
  const server = new Map();
  const previous = { ...row('fixed-source'), date: '2026-10-01', month: '2026-10', type: 'expense_fixed', category: 'insurance', is_fixed: true, payment_method: 'transfer' };
  seed(server, 'ledgerEntries', previous);
  server.set('users/default/settings/dashboard', { baseMonth: '2026-11', scope: 'combined', householdName: '우리집' });
  const a = device(server); const render = apartmentPage(a, 'ledger');
  await render(); await render(); await render(); await render();
  assert.equal(server.has(documentPath('ledgerEntries', 'ledger-fixed-2026-11-fixed-source')), true);
  assert.equal(a.control.writes, 1);
});

test('two actual monthly-plan pages create the same defaults without duplicate documents', async () => {
  const server = new Map();
  server.set('users/default/settings/dashboard', { baseMonth: '2026-11', scope: 'combined', householdName: '우리집' });
  const a = device(server); const b = device(server);
  const renderA = apartmentPage(a, 'monthly-plan'); const renderB = apartmentPage(b, 'monthly-plan');
  await renderA(); const treeA = await renderA();
  await renderB(); const treeB = await renderB();
  function findCreate(node) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) return node.map(findCreate).find(Boolean);
    if (node.type === 'button' && node.props.children.some(child => typeof child === 'string' && child.includes('월간 플랜 만들기'))) return node;
    return findCreate(node.props?.children);
  }
  const buttonA = findCreate(treeA); const buttonB = findCreate(treeB);
  assert.ok(buttonA); assert.ok(buttonB);
  await buttonA.props.onClick();
  await buttonB.props.onClick(); // B still displays the stale empty month.
  const ids = [...server.keys()].filter(key => key.includes('/monthlyPlanEntries/'));
  assert.equal(ids.length, 6);
  assert.equal(ids.filter(key => key.endsWith('/plan-2026-11-husband-cash')).length, 1);
});
