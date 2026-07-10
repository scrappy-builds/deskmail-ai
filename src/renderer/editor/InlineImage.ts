import { Node } from '@tiptap/core'

// Minimal inline image node (avoids adding @tiptap/extension-image just for this).
// Shared by the compose editor and the signature editor; images are embedded as
// data-URIs so they travel with the message.
export const InlineImage = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  draggable: true,
  addAttributes: () => ({ src: { default: null }, alt: { default: null } }),
  parseHTML: () => [{ tag: 'img[src]' }],
  renderHTML: ({ HTMLAttributes }) => ['img', { ...HTMLAttributes, style: 'max-width:100%' }]
})

// --- Paste-time downscaling ------------------------------------------------
// Emails with a 4000px screenshot inside balloon to several MB; cap inline
// images at MAX_INLINE_WIDTH before they enter the editor.

export const MAX_INLINE_WIDTH = 1600

// Pure: the dimensions an image should be encoded at (untouched when small).
export function targetSize(width: number, height: number, max = MAX_INLINE_WIDTH): { width: number; height: number; resized: boolean } {
  if (width <= max) return { width, height, resized: false }
  return { width: max, height: Math.round((height * max) / width), resized: true }
}

// Re-encode an oversized image via canvas. Photographic content goes to JPEG
// (0.85); PNGs only shrunk a little stay PNG so screenshots keep crisp text.
export function downscaleImage(dataUrl: string, mime: string, max = MAX_INLINE_WIDTH): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const t = targetSize(img.naturalWidth, img.naturalHeight, max)
      if (!t.resized) return resolve(dataUrl)
      const canvas = document.createElement('canvas')
      canvas.width = t.width
      canvas.height = t.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(dataUrl)
      ctx.drawImage(img, 0, 0, t.width, t.height)
      const keepPng = mime === 'image/png' && img.naturalWidth <= max * 1.5
      resolve(keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => resolve(dataUrl) // unreadable image — insert as-is
    img.src = dataUrl
  })
}
