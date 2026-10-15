# PROJECT PLAN — VECTOR ENGINE

## 1. Wizja

Vector Engine to modułowy edytor i silnik grafiki wektorowej działający w przeglądarce.
Interfejs użytkownika powstaje w Vue 3 + TypeScript + Tailwind, a krytyczne wydajnościowo
rasteryzowanie wykonuje silnik napisany w C++23 skompilowany do WebAssembly.
Rdzeń modelu dokumentu jest niezależny od frameworka i od silnika renderującego, dzięki czemu
ten sam dokument można renderować, walidować, migrować i eksportować w wielu kontekstach
(przeglądarka, testy, narzędzia wiersza poleceń).

Cele nadrzędne:

- przewidywalny, wersjonowany model dokumentu,
- natywny format projektu `.vex` z pełną informacją o zawartości,
- brak cichej utraty danych: każda niewspierana cecha jest raportowana,
- interfejs dostępny w języku polskim i angielskim,
- czytelny kod bez komentarzy, w którym intencję wyraża nazewnictwo i struktura.

## 2. Architektura

### 2.1 Stos technologiczny

| Warstwa         | Technologia                                     |
| --------------- | ----------------------------------------------- |
| UI              | Vue 3 (Composition API, `<script setup>`)       |
| Stan aplikacji  | Pinia, composables                              |
| Stylowanie      | Tailwind CSS 4                                  |
| Język aplikacji | TypeScript (tryb strict)                        |
| Silnik          | C++23 → WebAssembly (Emscripten)                |
| Fallback        | Canvas 2D w TypeScript                          |
| Walidacja       | Zod                                             |
| Kontener `.vex` | ZIP (fflate)                                    |
| Jakość          | ESLint, Prettier, Vitest, CTest, GitHub Actions |

### 2.2 Warstwy modułowe

```
src/
  core/      model dokumentu, geometria, kolory, scena renderowania, historia — bez zależności od frameworka
  engine/    interfejs silnika, Canvas2DEngine, WasmEngine i protokół binarny
  formats/   adaptery formatów: .vex, document-json, legacy-scene, eksport rastrowy
  app/       stany Pinia, serwisy, dokument przykładowy
  ui/        komponenty Vue i composables
  i18n/      słowniki PL/EN
cpp/
  include/vex/  nagłówki silnika (geometria, flatten, stroke, rasteryzator, protokół, C API)
  src/          implementacja
  tests/        testy natywne (CTest)
```

Reguły zależności (egzekwowane przez ESLint):

- `core` nie importuje niczego z warstw wyższych ani z Vue/Pinia/vue-i18n,
- `engine` zależy wyłącznie od `core`,
- `formats` zależy od `core` i `engine`,
- `app` nie importuje komponentów `ui`.

### 2.3 Silnik C++ / WebAssembly

Silnik otrzymuje scenę jako płaski bufor `Float64Array` (wersjonowany protokół), spłaszcza
krzywe Béziera w przestrzeni lokalnej z tolerancją dopasowaną do skali transformacji,
rasteryzuje wypełnienia regułą nonzero z antyaliasingiem opartym na akumulacji pola pokrycia
oraz buduje obrysy jako sumę czworokątów segmentów i okrągłych połączeń. Wynik to bufor RGBA8
ze zwykłą (niepremultiplikowaną) alfą.

Jeśli artefakty WebAssembly są niedostępne, aplikacja używa silnika Canvas 2D i informuje o tym
użytkownika w linii statusu.

## 3. Format danych

### 3.1 Natywny format `.vex`

`.vex` jest archiwum ZIP o ustalonej strukturze:

```
manifest.json      wersja formatu, generator, data utworzenia, lista wpisów
document.json      dokument w aktualnej wersji schematu
assets/            zasoby binarne (obrazy, fonty, profile kolorów)
previews/          miniatury podglądu
```

Czytnik raportuje ostrzeżenia dla nieznanych wpisów, brakujących zasobów i brakującego manifestu,
a zapis ostrzega, gdy dokument odwołuje się do zasobów, które nie są osadzane.

### 3.2 Adaptery formatów

Rejestr formatów wybiera czytnik po rozszerzeniu oraz po zawartości pliku. Każdy adapter
zwraca dokument wraz z listą ostrzeżeń (`FormatWarning`), a każdy zapis może zostać poprzedzony
inspekcją (`inspect`) zgłaszającą potencjalne straty przed eksportem.

### 3.3 Model dokumentu

```
VectorDocument { schemaVersion, id, name, width, height, unit, colorSpace, background,
                 layers[], assets[], metadata, exportSettings }
Layer          { id, name, visible, locked, opacity, children[] }
VectorNode     rectangle | ellipse | path | text | image | group
NodeBase       { id, name?, opacity, transform: Matrix2D }
Matrix2D       { a, b, c, d, e, f }
PaintStyle     { fill?: { color }, stroke?: { color, width } }
```

Schemat jest wersjonowany; dokumenty starszych wersji przechodzą przez migracje, a niepoprawne
dane są zgłaszane jako lista problemów ze ścieżką i przyczyną.

### 3.4 Zasada braku cichej utraty danych

Tekst, obrazy i reguła wypełnienia evenodd są obecnie poza możliwościami silnika rasteryzującego.
Takie węzły pozostają w dokumencie, a interfejs wyświetla listę elementów pominiętych podczas
renderowania. Eksport do formatów bez kanału alfa ostrzega o spłaszczeniu przezroczystości.
