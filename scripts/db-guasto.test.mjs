/**
 * Quando il database non risponde, la risposta deve dire perché.
 *
 * Prima usciva solo «non raggiungibile» e un booleano: per sapere altro
 * bisognava avere accesso ai log della piattaforma. Quasi sempre la causa è una
 * sola parola — token scaduto, indirizzo sbagliato, database archiviato — e
 * l'app ce l'ha già in mano.
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { describeDbFailure } from '../server/db.js';

/** Un errore come lo alza il client libsql. */
function libsql(code, message) {
  const err = new Error(message);
  err.name = 'LibsqlError';
  err.code = code;
  return err;
}

test('un token rifiutato lo dice, e dice cosa fare', () => {
  const d = describeDbFailure(libsql('SERVER_ERROR', 'SERVER_ERROR: Server returned HTTP status 401: Unauthorized'));
  assert.equal(d.db_status, 401);
  assert.equal(d.db_code, 'SERVER_ERROR');
  assert.match(d.hint, /TURSO_AUTH_TOKEN/);
});

test('un database che non c’è manda a controllare l’indirizzo', () => {
  const d = describeDbFailure(libsql('SERVER_ERROR', 'SERVER_ERROR: Server returned HTTP status 404: Not found'));
  assert.equal(d.db_status, 404);
  assert.match(d.hint, /TURSO_DATABASE_URL/);
});

test('un indirizzo malformato si riconosce dal codice, senza stato HTTP', () => {
  const d = describeDbFailure(libsql('URL_INVALID', 'URL_INVALID: The URL is not in a valid format'));
  assert.equal(d.db_status, null);
  assert.match(d.hint, /non è un indirizzo valido/);
});

test('un database irraggiungibile non è un database che rifiuta', () => {
  const d = describeDbFailure(new Error('fetch failed'));
  assert.equal(d.db_status, null);
  assert.match(d.hint, /archiviato o spento/);
});

test('oltre i limiti del piano è un caso a sé', () => {
  const d = describeDbFailure(libsql('SERVER_ERROR', 'SERVER_ERROR: Server returned HTTP status 402: Payment Required'));
  assert.equal(d.db_status, 402);
  assert.match(d.hint, /limiti del piano/);
});

test('quello che non si riconosce rimanda ai log, senza inventare', () => {
  const d = describeDbFailure(new Error('qualcosa di inatteso'));
  assert.equal(d.db_code, null);
  assert.equal(d.db_status, null);
  assert.match(d.hint, /\[avvio\]/);
});

test('il messaggio grezzo non esce mai', () => {
  const segreto = 'SERVER_ERROR: Server returned HTTP status 401: token eyJhbGciOi...';
  const d = describeDbFailure(libsql('SERVER_ERROR', segreto));
  assert.deepEqual(Object.keys(d).sort(), ['db_code', 'db_status', 'hint'],
    'e non «code», che nella risposta è già il codice d’errore dell’app');
  for (const valore of Object.values(d)) {
    assert.ok(!String(valore).includes('eyJhbGciOi'), 'niente del messaggio originale deve finire nella risposta');
  }
});
