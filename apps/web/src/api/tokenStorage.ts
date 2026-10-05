const TOKEN_KEY = 'code-connect.access-token'

// "Lembrar-me" decides where the token lives: localStorage survives closing the browser,
// sessionStorage ends with the tab. Storage can throw (blocked site data, private mode),
// so every access is guarded and the app just behaves as logged out.
function read(storage: () => Storage): string | null {
  try {
    return storage().getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function remove(storage: () => Storage) {
  try {
    storage().removeItem(TOKEN_KEY)
  } catch {
    // Nothing to clear.
  }
}

export function getToken(): string | null {
  return read(() => localStorage) ?? read(() => sessionStorage)
}

export function saveToken(token: string, remember: boolean) {
  clearToken()
  try {
    const storage = remember ? localStorage : sessionStorage
    storage.setItem(TOKEN_KEY, token)
  } catch {
    // Without storage the session lasts until the page is reloaded.
  }
}

export function clearToken() {
  remove(() => localStorage)
  remove(() => sessionStorage)
}
