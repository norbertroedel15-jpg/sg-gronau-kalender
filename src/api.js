export async function api(path, method = 'GET', body) {
  const response = await fetch(`/api/${path}`, { method, headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const result = await response.json()
  if (!response.ok) { const error = new Error(result.error || 'Verbindung fehlgeschlagen.'); error.status = response.status; throw error }
  return result
}
