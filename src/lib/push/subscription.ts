type Subscription = { endpoint: string; keys: { auth: string; p256dh: string } }

const serviceHosts = new Set([
  'fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com',
])

export function parsePushSubscription(value: unknown): Subscription | null {
  if (!value || typeof value !== 'object' || !('endpoint' in value) || typeof value.endpoint !== 'string'
    || value.endpoint.length > 2048 || !('keys' in value) || !value.keys || typeof value.keys !== 'object') return null
  const endpoint = URL.parse(value.endpoint)
  if (!endpoint || endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port || endpoint.hash
    || !(serviceHosts.has(endpoint.hostname) || endpoint.hostname.endsWith('.notify.windows.com'))) return null

  const { auth, p256dh } = value.keys as Record<string, unknown>
  if (typeof auth !== 'string' || !/^[\w-]{22}={0,2}$/.test(auth)
    || typeof p256dh !== 'string' || !/^[\w-]{87}=?$/.test(p256dh)) return null

  return { endpoint: endpoint.href, keys: { auth, p256dh } }
}
