// MP3 frames are self-contained, so byte concatenation yields a playable file.
export const concatMp3 = (blobs) => new Blob(blobs, { type: 'audio/mpeg' })
