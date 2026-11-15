import { createClient } from './http.js'

// Wikipedia REST API (free, no key). Used only to fill gaps: driver portraits F1/OpenF1 don't have,
// and team logos. Images come from Wikipedia / Wikimedia Commons under their own licences,
// which is why the UI shows a credit line.
const client = createClient({ baseUrl: 'https://en.wikipedia.org/api/rest_v1', minIntervalMs: 250, name: 'Wikipedia' })

// Jolpica stores links like http://en.wikipedia.org/wiki/Lewis_Hamilton
export const titleFromUrl = (url) => {
    const match = /wikipedia\.org\/wiki\/([^?#]+)/.exec(url || '')
    return match ? decodeURIComponent(match[1]) : null
}

// Lead image of an article (a portrait for drivers, usually the logo for teams), or null.
export const getLeadImage = async (title) => {
    if (!title) return null
    try {
        const summary = await client.get(`/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`)
        const src = summary.thumbnail?.source || summary.originalimage?.source
        // Drop Wikimedia's analytics query string.
        return src ? src.split('?')[0] : null
    } catch {
        return null
    }
}
