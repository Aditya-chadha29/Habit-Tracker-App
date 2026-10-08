/**
 * Turns the export text into parts small enough for one cloud document each, and back.
 * Compressed where the browser can; stored as it is where it cannot.
 */
export type Encoding = 'gzip' | 'plain'

/** A Firestore document holds at most 1 MiB; this leaves room for the rest of the document. */
export const CHUNK_BYTES = 900_000

export interface Packed {
  encoding: Encoding
  bytes: number
  chunks: Uint8Array[]
}

type ByteStream = TransformStream<Uint8Array, Uint8Array>

async function through(bytes: Uint8Array, stream: ByteStream): Promise<Uint8Array> {
  const piped = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as TransformStream<Uint8Array<ArrayBuffer>, Uint8Array>)
  return new Uint8Array(await new Response(piped).arrayBuffer())
}

export async function pack(text: string, chunkBytes: number = CHUNK_BYTES): Promise<Packed> {
  const raw = new TextEncoder().encode(text)
  let body: Uint8Array = raw
  let encoding: Encoding = 'plain'
  if (typeof CompressionStream !== 'undefined') {
    try {
      body = await through(raw, new CompressionStream('gzip') as unknown as ByteStream)
      encoding = 'gzip'
    } catch {
      body = raw
    }
  }
  const chunks: Uint8Array[] = []
  for (let start = 0; start < body.length; start += chunkBytes) chunks.push(body.slice(start, start + chunkBytes))
  if (!chunks.length) chunks.push(new Uint8Array())
  return { encoding, bytes: body.length, chunks }
}

export async function unpack(encoding: Encoding, chunks: Uint8Array[]): Promise<string> {
  const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.length
  }
  if (encoding === 'plain') return new TextDecoder().decode(joined)
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read the cloud copy. Update the browser, then try again.')
  return new TextDecoder().decode(await through(joined, new DecompressionStream('gzip') as unknown as ByteStream))
}
