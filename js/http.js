/**
 * Livello HTTP verso la REST API del server.
 *
 * Sostituisce il client Supabase. Gli errori del server portano un `code` nello stesso
 * formato che PostgREST usava (es. '23505' per violazione di unique), così i rami di
 * gestione errore già presenti in api.js continuano a funzionare senza modifiche.
 */

let unauthorizedHandler = null;

/**
 * Registra cosa fare quando il server risponde 401.
 *
 * È il sostituto di supabase.auth.onAuthStateChange: non esistendo un evento di sessione,
 * la scadenza si scopre alla prima chiamata che fallisce. auth.js registra qui la stessa
 * logica che eseguiva nel ramo SIGNED_OUT.
 */
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

function buildError(status, payload) {
  const err = new Error(payload?.error?.message || `Errore del server (${status})`);
  err.code = payload?.error?.code;
  err.status = status;
  return err;
}

export async function request(method, path, body) {
  const options = {
    method,
    credentials: 'same-origin',
    headers: {}
  };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new Error('Impossibile raggiungere il server. Verifica la connessione e riprova.');
  }

  if (res.status === 204) return null;

  const text = await res.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    // Un 401 sulle rotte di autenticazione è una credenziale sbagliata, non una sessione
    // scaduta: non deve far scattare il reset della UI.
    if (res.status === 401 && unauthorizedHandler && !path.startsWith('/api/auth/')) {
      unauthorizedHandler();
    }
    throw buildError(res.status, payload);
  }

  return payload;
}
