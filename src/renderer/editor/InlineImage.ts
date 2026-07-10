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
