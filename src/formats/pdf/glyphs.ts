const latin1Supplement = `space exclamdown cent sterling currency yen brokenbar section dieresis copyright
ordfeminine guillemotleft logicalnot hyphen registered macron degree plusminus twosuperior threesuperior
acute mu paragraph periodcentered cedilla onesuperior ordmasculine guillemotright onequarter onehalf
threequarters questiondown Agrave Aacute Acircumflex Atilde Adieresis Aring AE Ccedilla Egrave Eacute
Ecircumflex Edieresis Igrave Iacute Icircumflex Idieresis Eth Ntilde Ograve Oacute Ocircumflex Otilde
Odieresis multiply Oslash Ugrave Uacute Ucircumflex Udieresis Yacute Thorn germandbls agrave aacute
acircumflex atilde adieresis aring ae ccedilla egrave eacute ecircumflex edieresis igrave iacute
icircumflex idieresis eth ntilde ograve oacute ocircumflex otilde odieresis divide oslash ugrave uacute
ucircumflex udieresis yacute thorn ydieresis`

const latinExtendedA = `Amacron amacron Abreve abreve Aogonek aogonek Cacute cacute Ccircumflex ccircumflex
Cdotaccent cdotaccent Ccaron ccaron Dcaron dcaron Dcroat dcroat Emacron emacron Ebreve ebreve
Edotaccent edotaccent Eogonek eogonek Ecaron ecaron Gcircumflex gcircumflex Gbreve gbreve Gdotaccent
gdotaccent Gcommaaccent gcommaaccent Hcircumflex hcircumflex Hbar hbar Itilde itilde Imacron imacron
Ibreve ibreve Iogonek iogonek Idotaccent dotlessi IJ ij Jcircumflex jcircumflex Kcommaaccent
kcommaaccent kgreenlandic Lacute lacute Lcommaaccent lcommaaccent Lcaron lcaron Ldot ldot Lslash
lslash Nacute nacute Ncommaaccent ncommaaccent Ncaron ncaron napostrophe Eng eng Omacron omacron
Obreve obreve Ohungarumlaut ohungarumlaut OE oe Racute racute Rcommaaccent rcommaaccent Rcaron rcaron
Sacute sacute Scircumflex scircumflex Scedilla scedilla Scaron scaron Tcommaaccent tcommaaccent Tcaron
tcaron Tbar tbar Utilde utilde Umacron umacron Ubreve ubreve Uring uring Uhungarumlaut uhungarumlaut
Uogonek uogonek Wcircumflex wcircumflex Ycircumflex ycircumflex Ydieresis Zacute zacute Zdotaccent
zdotaccent Zcaron zcaron longs`

const punctuation: ReadonlyArray<readonly [number, string]> = [
  [0x0192, 'florin'],
  [0x02c6, 'circumflex'],
  [0x02c7, 'caron'],
  [0x02d8, 'breve'],
  [0x02d9, 'dotaccent'],
  [0x02da, 'ring'],
  [0x02db, 'ogonek'],
  [0x02dc, 'tilde'],
  [0x02dd, 'hungarumlaut'],
  [0x2013, 'endash'],
  [0x2014, 'emdash'],
  [0x2018, 'quoteleft'],
  [0x2019, 'quoteright'],
  [0x201a, 'quotesinglbase'],
  [0x201c, 'quotedblleft'],
  [0x201d, 'quotedblright'],
  [0x201e, 'quotedblbase'],
  [0x2020, 'dagger'],
  [0x2021, 'daggerdbl'],
  [0x2022, 'bullet'],
  [0x2026, 'ellipsis'],
  [0x2030, 'perthousand'],
  [0x2039, 'guilsinglleft'],
  [0x203a, 'guilsinglright'],
  [0x20ac, 'Euro'],
  [0x2122, 'trademark'],
  [0x2212, 'minus'],
]

const buildTable = (): ReadonlyMap<number, string> => {
  const table = new Map<number, string>()
  latin1Supplement.split(/\s+/).forEach((name, index) => table.set(0xa0 + index, name))
  latinExtendedA.split(/\s+/).forEach((name, index) => table.set(0x100 + index, name))
  punctuation.forEach(([codePoint, name]) => table.set(codePoint, name))
  return table
}

export const glyphNames: ReadonlyMap<number, string> = buildTable()

export const glyphNameFor = (codePoint: number): string | undefined => glyphNames.get(codePoint)
