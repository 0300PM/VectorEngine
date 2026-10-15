export type XmlParser = (text: string) => Document

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const CDATA_SECTION_NODE = 4

export const browserXmlParser: XmlParser = (text) => {
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml')
  const error = parsed.getElementsByTagName('parsererror').item(0)
  if (error) {
    throw new SyntaxError(error.textContent?.trim() || 'Malformed XML')
  }
  return parsed
}

export const elementChildren = (node: Node): Element[] =>
  Array.from(node.childNodes).filter((child): child is Element => child.nodeType === ELEMENT_NODE)

export const localName = (element: Element): string =>
  element.localName || element.tagName.replace(/^.*:/, '')

export const attribute = (element: Element, name: string): string | undefined => {
  const value = element.getAttribute(name)
  return value === null ? undefined : value
}

export const hrefAttribute = (element: Element): string | undefined =>
  attribute(element, 'href') ?? attribute(element, 'xlink:href')

export const textContent = (node: Node): string =>
  Array.from(node.childNodes)
    .map((child) => {
      if (child.nodeType === TEXT_NODE || child.nodeType === CDATA_SECTION_NODE) {
        return child.nodeValue ?? ''
      }
      return child.nodeType === ELEMENT_NODE ? textContent(child) : ''
    })
    .join('')

const escapes: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

export const escapeXml = (text: string): string =>
  text.replace(/[&<>"]/g, (character) => escapes[character] ?? character)
