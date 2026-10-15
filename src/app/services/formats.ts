import { browserXmlParser, createDefaultFormatRegistry } from '@/formats'

export const formatRegistry = createDefaultFormatRegistry({ xmlParser: browserXmlParser })
