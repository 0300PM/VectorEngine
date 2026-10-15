# VECTOR ENGINE — ROZSZERZONA SPECYFIKACJA FUNKCJONALNA

## 1. Konwersja wsadowa (Batch Converter)

### Cel

Stworzenie niezależnego modułu umożliwiającego konwertowanie wielu plików jednocześnie bez konieczności otwierania każdego z nich w edytorze.

### Funkcjonalności

- Importowanie wielu plików za pomocą przeciągania i upuszczania.
- Wybieranie wielu plików z systemowego eksploratora plików.
- Obsługa wielu formatów źródłowych i docelowych.
- Konwersja wielu plików do jednego formatu.
- Konwersja jednego pliku do wielu formatów jednocześnie.
- Konwersja całych katalogów.
- Rekurencyjne przeszukiwanie podkatalogów jako opcjonalna funkcja.
- Kolejka zadań z możliwością zmiany kolejności.
- Wstrzymywanie, wznawianie i anulowanie zadań.
- Ponawianie nieudanych konwersji.
- Wyświetlanie postępu dla pojedynczego pliku i całej kolejki.
- Raportowanie błędów i ostrzeżeń.
- Pomijanie plików już przetworzonych.
- Wykrywanie duplikatów i konfliktów nazw.
- Możliwość nadpisywania, pomijania lub automatycznego zmieniania nazw istniejących plików.
- Zachowywanie lub zmiana struktury katalogów wyjściowych.
- Zapisywanie konfiguracji konwersji jako presetów.
- Zapisywanie historii ostatnich operacji.
- Eksport raportu z całej sesji konwersji.

### Ustawienia konwersji

Użytkownik powinien mieć możliwość określenia:

- formatu docelowego;
- katalogu wyjściowego;
- sposobu generowania nazw plików;
- jakości i poziomu kompresji;
- wymiarów obrazu;
- rozdzielczości DPI;
- przestrzeni kolorystycznej;
- koloru lub przezroczystości tła;
- sposobu obsługi nieobsługiwanych właściwości;
- zachowania metadanych;
- sposobu raportowania błędów.

### Wymagania techniczne

Konwersja musi działać przez wspólny pipeline adapterów formatów. Kolejka powinna przetwarzać pliki niezależnie, z kontrolowanym limitem równoległości i zużycia pamięci.

Każde zadanie powinno mieć unikalny identyfikator oraz stan: oczekujące, przetwarzane, zakończone, zakończone z ostrzeżeniami, nieudane lub anulowane.

W przypadku błędu jednego pliku pozostałe zadania powinny być kontynuowane.

Priorytet: P0/P1.

---

## 2. Zaawansowana geometria wektorowa

### Cel

Rozwinięcie silnika C++ o zestaw operacji geometrycznych umożliwiających precyzyjną edycję i przekształcanie grafiki wektorowej.

### Operacje boolowskie

- Suma dwóch lub większej liczby ścieżek.
- Część wspólna ścieżek.
- Różnica geometryczna.
- XOR, czyli obszary należące tylko do jednego z operandów.
- Dzielenie ścieżek na osobne obiekty.
- Łączenie nakładających się konturów.
- Usuwanie fragmentów znajdujących się wewnątrz innych kształtów.
- Obsługa wielu konturów i otworów wewnętrznych.

### Operacje na ścieżkach

- Dodawanie i usuwanie punktów kontrolnych.
- Zmiana rodzaju węzła.
- Łączenie i rozdzielanie ścieżek.
- Zamykanie otwartych konturów.
- Odwracanie kierunku ścieżki.
- Upraszczanie geometrii z określoną tolerancją błędu.
- Redukcja liczby punktów bez nadmiernej zmiany kształtu.
- Konwersja krzywych do odcinków.
- Konwersja odcinków i krzywych do reprezentacji obsługiwanej przez format docelowy.
- Wykrywanie samoprzecięć.
- Wykrywanie zdegenerowanych konturów.
- Obliczanie długości ścieżek.
- Obliczanie dokładnych granic krzywych.

### Offsetowanie i kontury

- Tworzenie konturu zewnętrznego.
- Tworzenie konturu wewnętrznego.
- Rozszerzanie lub zmniejszanie geometrii o określoną odległość.
- Konfigurowanie połączeń narożników.
- Obsługa zakończeń zaokrąglonych, prostych i ostrych.
- Kontrolowanie limitu ostrych narożników.
- Wykrywanie błędów powstających przy offsetowaniu wąskich lub złożonych kształtów.

### Wyrównywanie i rozkład

- Wyrównanie do lewej, prawej, góry i dołu.
- Wyrównanie do środka poziomo i pionowo.
- Rozkład obiektów w równych odstępach.
- Dopasowanie rozmiaru do obiektu referencyjnego.
- Przyciąganie do siatki, prowadnic, punktów i krawędzi.
- Wyrównywanie względem płótna, zaznaczenia lub obiektu kluczowego.

### Wymagania techniczne

Wszystkie operacje geometryczne muszą działać na wspólnym modelu geometrii. Operacje boolowskie i offsetowanie powinny korzystać ze sprawdzonych algorytmów C++.

Każda operacja musi określać sposób obsługi błędów numerycznych, tolerancji, pustych ścieżek oraz konturów samoprzecinających się.

Priorytet: P0/P1 dla podstawowej geometrii, P1/P2 dla zaawansowanych operacji.

---

## 3. Eksport wielowymiarowy i wiele obszarów roboczych

### Cel

Umożliwienie tworzenia jednego projektu zawierającego wiele wariantów grafiki i eksportowania ich w różnych rozmiarach oraz formatach.

### Obszary robocze

- Tworzenie wielu plansz w jednym dokumencie.
- Ustalanie niezależnych wymiarów każdej planszy.
- Zmiana nazw plansz.
- Duplikowanie plansz.
- Zmiana kolejności plansz.
- Ustalanie tła i jednostek.
- Eksport pojedynczej planszy lub wszystkich plansz.
- Eksport zaznaczonych plansz.
- Dopasowanie widoku do wybranej planszy.
- Możliwość przenoszenia obiektów pomiędzy planszami.
- Obsługa wspólnych zasobów i stylów.

### Eksport wielowymiarowy

Użytkownik powinien móc przygotować zestaw eksportu obejmujący:

- oryginalny rozmiar;
- warianty 1x, 2x i 3x;
- dowolne niestandardowe wymiary;
- różne formaty wyjściowe;
- różne poziomy kompresji;
- warianty z przezroczystym lub jednolitym tłem.

### Przykładowy preset

Jedna plansza logo może być eksportowana jednocześnie jako:

- SVG do internetu;
- PNG 256 × 256;
- PNG 512 × 512;
- PNG 1024 × 1024;
- PDF do druku.

### Zarządzanie eksportem

- Eksport całego dokumentu.
- Eksport wybranych obiektów.
- Eksport zaznaczenia z przycięciem do granic.
- Automatyczne nazewnictwo plików na podstawie projektu i planszy.
- Podgląd wynikowych wymiarów.
- Wykrywanie kolizji nazw.
- Zapisywanie presetów eksportowych.
- Eksport do katalogów według określonego schematu.

### Wymagania techniczne

Model dokumentu musi obsługiwać wiele obszarów roboczych i rozróżniać wymiary dokumentu, planszy oraz eksportowanego obrazu.

Pipeline eksportu musi przyjmować zakres eksportu, skalę, format i ustawienia renderowania jako jawne parametry.

Priorytet: P1.

---

## 4. Raport zgodności i strat konwersji

### Cel

Stworzenie systemu analizującego dokument przed konwersją i informującego o potencjalnych zmianach wizualnych lub strukturalnych.

### Analiza przed konwersją

System powinien wykrywać:

- nieobsługiwane typy obiektów;
- efekty specjalne;
- filtry;
- gradienty;
- maski;
- przezroczystość;
- nieobsługiwane tryby mieszania;
- brakujące fonty;
- tekst wymagający zamiany na kontury;
- osadzone obrazy;
- odwołania do zewnętrznych zasobów;
- różnice w obsłudze jednostek;
- funkcje specyficzne dla formatu źródłowego;
- elementy, których nie można odwzorować w formacie docelowym.

### Kategorie ostrzeżeń

- Informacja — zmiana nie wpływa istotnie na rezultat.
- Ostrzeżenie — istnieje ryzyko różnicy wizualnej lub strukturalnej.
- Błąd — konwersja nie może być poprawnie wykonana.
- Krytyczny problem zgodności — wynik może nie nadawać się do zamierzonego zastosowania.

### Proponowane działania naprawcze

W zależności od sytuacji system powinien umożliwiać:

- zamianę tekstu na kontury;
- spłaszczenie efektów do grafiki rastrowej;
- uproszczenie gradientów;
- zamianę krzywych na odcinki;
- usunięcie nieobsługiwanych efektów;
- zastąpienie brakującej czcionki;
- konwersję kolorów;
- zmianę jednostek;
- pominięcie problematycznych obiektów;
- anulowanie konwersji.

### Raport po konwersji

Raport powinien zawierać:

- format źródłowy i docelowy;
- liczbę przetworzonych obiektów;
- liczbę ostrzeżeń;
- listę utraconych właściwości;
- listę wykonanych przekształceń;
- informacje o zastąpionych zasobach;
- status walidacji pliku wynikowego.

### Wymagania techniczne

Każdy adapter musi deklarować obsługiwane funkcje. Analiza zgodności powinna porównywać wymagania dokumentu z możliwościami konkretnego eksportera.

System nie może obiecywać pełnej zgodności, jeżeli nie została ona zweryfikowana.

Priorytet: P0.

---

## 5. Asset Studio

### Cel

Stworzenie osobnego modułu przeznaczonego do przygotowywania zasobów graficznych dla stron internetowych, aplikacji mobilnych, aplikacji desktopowych i gier.

### Obsługiwane zasoby

- Ikony aplikacji.
- Favicony.
- Zestawy ikon SVG.
- Sprite'y SVG.
- Zasoby PNG w wielu rozmiarach.
- Grafiki interfejsu.
- Logotypy w różnych wariantach.
- Zasoby dla Androida i iOS.
- Zasoby graficzne dla gier.
- Atlasy tekstur jako rozszerzenie.

### Generator ikon

- Eksport jednego źródła do wielu rozmiarów.
- Generowanie wariantów jasnych i ciemnych.
- Generowanie wersji monochromatycznych.
- Konfigurowanie marginesów wewnętrznych.
- Ustalanie koloru tła.
- Kontrola kadrowania.
- Automatyczne nazewnictwo.
- Podgląd na jasnym i ciemnym tle.

### Generator favicon

- Tworzenie zestawu ikon o określonych rozmiarach.
- Eksport ICO.
- Eksport PNG.
- Eksport SVG.
- Generowanie plików manifestu internetowego.
- Generowanie przykładowych tagów HTML.
- Podgląd w kontekście przeglądarki.

### Eksport dla aplikacji

- Generowanie katalogów z zasobami.
- Tworzenie zestawów nazwanych według rozmiaru i przeznaczenia.
- Generowanie pliku JSON z metadanymi.
- Opcjonalne tworzenie manifestów.
- Walidacja wymiarów i przezroczystości.
- Wykrywanie brakujących wymaganych wariantów.

### Wymagania techniczne

Asset Studio musi korzystać z tego samego pipeline'u renderowania i eksportu co główny edytor. Nie powinno implementować niezależnego silnika grafiki.

Priorytet: P1.

---

## 6. Raster-to-Vector — wektoryzacja obrazów

### Cel

Umożliwienie przekształcania grafiki rastrowej w edytowalne ścieżki wektorowe.

### Funkcjonalności

- Import PNG, JPEG i innych obsługiwanych formatów rastrowych.
- Wektoryzacja obrazów monochromatycznych.
- Wykrywanie krawędzi.
- Wykrywanie konturów.
- Wektoryzacja grafiki o ograniczonej liczbie kolorów.
- Segmentacja obrazu na obszary kolorów.
- Upraszczanie wygenerowanych ścieżek.
- Redukcja liczby punktów kontrolnych.
- Regulacja dokładności dopasowania.
- Kontrola liczby kolorów.
- Usuwanie drobnych obszarów i szumu.
- Wykrywanie i zachowywanie otworów wewnętrznych.
- Podgląd przed zatwierdzeniem.
- Możliwość edycji wynikowych ścieżek.

### Ustawienia

- Próg jasności.
- Liczba kolorów.
- Czułość wykrywania konturów.
- Tolerancja uproszczenia.
- Minimalny rozmiar obszaru.
- Dokładność dopasowania krzywych.
- Wygładzanie krawędzi.

### Wymagania techniczne

Wektoryzacja powinna być osobnym modułem przetwarzania obrazu. Nie należy utożsamiać jej ze zwykłym osadzaniem bitmapy w pliku SVG.

W pierwszej wersji należy obsłużyć obrazy monochromatyczne, a dopiero później wielokolorowe ilustracje.

Priorytet: P2.

---

## 7. Preflight i przygotowanie do druku

### Cel

Weryfikowanie grafiki przed przekazaniem jej do drukarni lub innego procesu produkcyjnego.

### Funkcjonalności

- Kontrola wymiarów dokumentu.
- Kontrola jednostek.
- Konfigurowalne spady.
- Generowanie znaczników cięcia.
- Kontrola obszaru zadruku.
- Wykrywanie obiektów poza stroną.
- Wykrywanie brakujących fontów.
- Wykrywanie obrazów o zbyt niskiej rozdzielczości.
- Kontrola przezroczystości.
- Kontrola kolorów.
- Weryfikacja osadzonych zasobów.
- Kontrola zgodności z wybranym profilem eksportu.
- Raport błędów i ostrzeżeń.
- Eksport pliku po przeprowadzeniu walidacji.

### Presety

System powinien umożliwiać definiowanie profili dla określonych procesów druku, w tym wymaganych wymiarów, spadów, profili kolorystycznych i standardów PDF.

Nie należy zakładać, że wszystkie drukarnie korzystają z tych samych parametrów.

### Wymagania techniczne

Preflight musi być oparty na jawnie określonych regułach i profilach. System powinien rozróżniać błędy uniemożliwiające spełnienie wymagań od ostrzeżeń, które wymagają decyzji użytkownika.

Priorytet: P2.

---

## 8. Zarządzanie kolorami i profile ICC

### Cel

Zapewnienie spójnego zarządzania kolorami w dokumentach, podglądzie, imporcie, eksporcie i przygotowaniu do druku.

### Funkcjonalności

- Obsługa sRGB.
- Obsługa Display-P3.
- Import i odczyt profili ICC.
- Konwersja kolorów pomiędzy obsługiwanymi przestrzeniami.
- Ustawianie profilu dokumentu.
- Wybór profilu wyjściowego.
- Podgląd potencjalnych różnic kolorystycznych.
- Obsługa palet kolorów.
- Zapisywanie własnych palet.
- Import i eksport palet.
- Walidacja nieobsługiwanych przestrzeni kolorystycznych.

### Rozszerzenia profesjonalne

- Kolory dodatkowe.
- Symulacja wyjścia drukarskiego.
- Soft proofing.
- Kontrola konwersji do CMYK.
- Raportowanie kolorów poza zakresem urządzenia docelowego.

### Wymagania techniczne

Wewnętrzny model kolorów musi być oddzielony od sposobu wyświetlania kolorów przez przeglądarkę.

Konwersje ICC powinny korzystać ze sprawdzonego systemu zarządzania kolorami. Nie należy implementować pełnego przetwarzania ICC wyłącznie za pomocą prostych konwersji RGB/HEX.

Priorytet: P2.

---

## 9. CLI i automatyzacja

### Cel

Umożliwienie korzystania z silnika bez uruchamiania interfejsu graficznego.

### Przykładowe polecenia

- Konwersja pojedynczego pliku.
- Konwersja całego katalogu.
- Konwersja do wielu formatów.
- Eksport wybranych plansz.
- Eksport wielowymiarowy.
- Walidacja pliku.
- Generowanie raportu zgodności.
- Odczyt metadanych dokumentu.
- Uruchamianie zapisanych presetów.
- Przetwarzanie wsadowe.
- Weryfikacja plików w pipeline CI/CD.

### Przykładowa składnia

```
vector-engine convert input.svg --format png --output output.png

vector-engine batch ./assets --format webp --output ./dist

vector-engine validate project.vex --report report.json

vector-engine export project.vex --preset web-assets
```

### Wymagania techniczne

CLI musi korzystać z tych samych adapterów i algorytmów co aplikacja graficzna.

Wyniki powinny być raportowane za pomocą kodów wyjścia i opcjonalnych raportów JSON. Błędy muszą być możliwe do obsłużenia w skryptach.

Wersja natywna CLI może korzystać bezpośrednio z C++. Nie powinna wymagać uruchamiania przeglądarki.

Priorytet: P1/P2.

---

## 10. System pluginów

### Cel

Umożliwienie rozszerzania aplikacji o nowe formaty, narzędzia, filtry i automatyzacje bez modyfikowania głównego kodu.

### Rodzaje rozszerzeń

- Adaptery importu i eksportu.
- Narzędzia edycyjne.
- Filtry geometryczne.
- Filtry wizualne.
- Presety eksportowe.
- Integracje z innymi aplikacjami.
- Automatyzacje.
- Dodatkowe panele interfejsu.

### Funkcjonalności

- Rejestracja rozszerzeń.
- Manifest pluginu.
- Wersjonowanie API.
- Sprawdzanie kompatybilności.
- Zarządzanie uprawnieniami.
- Włączanie i wyłączanie pluginów.
- Obsługa błędów rozszerzeń.
- Logowanie zdarzeń.
- Możliwość odinstalowania rozszerzenia.
- Dokumentacja API dla autorów pluginów.

### Bezpieczeństwo

Pluginy nie mogą automatycznie otrzymywać pełnego dostępu do plików użytkownika, sieci ani systemu operacyjnego.

Rozszerzenia zewnętrzne powinny działać w ograniczonym środowisku z jawnie określonymi uprawnieniami. Należy rozdzielić zaufane rozszerzenia natywne od rozszerzeń uruchamianych w sandboxie.

### Wymagania techniczne

Najpierw należy stworzyć stabilne API silnika i system adapterów. Dopiero po ich ustabilizowaniu można udostępnić publiczny system pluginów.

Priorytet: P2/P3.

---

## 11. Funkcje przekrojowe wymagane w całej aplikacji

### Nieinwazyjna edycja

Efekty, transformacje i operacje powinny być przechowywane w sposób umożliwiający ich późniejszą modyfikację, o ile pozwala na to dana funkcja.

Operacje destrukcyjne powinny być jawnie oznaczone. Użytkownik powinien mieć możliwość cofnięcia zmian w historii dokumentu.

### System zasobów

Aplikacja powinna zarządzać obrazami, fontami, profilami ICC, paletami, wzorami i innymi zasobami używanymi w projektach.

System musi wykrywać brakujące zasoby, duplikaty i nieprawidłowe odwołania.

### Porównywanie konwersji

Użytkownik powinien mieć możliwość porównania oryginału z wynikiem konwersji.

Widok może obejmować:

- podgląd obok siebie;
- widok dzielony;
- nakładanie obrazów;
- podświetlanie różnic;
- listę ostrzeżeń;
- podgląd obiektów utraconych lub zmienionych.

### Wydajność dużych dokumentów

Silnik powinien stosować:

- cache geometrii;
- cache granic obiektów;
- indeks przestrzenny;
- renderowanie przyrostowe;
- kontrolowane użycie Web Workers;
- ograniczenie niepotrzebnych kopii pamięci;
- profilowanie operacji geometrycznych;
- możliwość anulowania długich zadań.

### Prywatność i praca lokalna

Podstawowe operacje powinny działać lokalnie bez wymogu rejestracji.

Pliki nie powinny być wysyłane na serwer bez wyraźnej zgody użytkownika. Ewentualne funkcje chmurowe muszą być opcjonalne.

### Wersjonowanie formatu

Każdy dokument musi posiadać wersję schematu. Migracje powinny być jawne, testowane i umożliwiać wykrywanie niezgodności.

### Testy kompatybilności

Każdy adapter musi mieć zestaw plików testowych oraz udokumentowany zakres obsługiwanych funkcji.

Testy powinny obejmować poprawność strukturalną, wizualną i zachowanie właściwości dokumentu.

---

# 12. KOLEJNOŚĆ WDRAŻANIA

## P0 — fundament

- Model dokumentu i format natywny.
- Core geometrii C++.
- SVG import/export.
- PNG, JPEG i PDF.
- Podstawowy edytor.
- Undo/redo.
- Raport strat konwersji.
- Testy i walidacja.

## P1 — praktyczna użyteczność

- Konwersja wsadowa.
- Eksport wielowymiarowy.
- Wiele obszarów roboczych.
- Asset Studio.
- WebP, TIFF i ICO.
- Rozszerzone operacje geometryczne.
- Podstawowe CLI.
- Presety eksportowe.

## P2 — funkcje profesjonalne

- Raster-to-Vector.
- DXF i HPGL.
- Preflight do druku.
- Profile ICC.
- Zaawansowany import PDF.
- Rozszerzone raporty zgodności.
- System rozszerzeń w wersji eksperymentalnej.

## P3 — rozwój ekosystemu

- Rozbudowany system pluginów.
- Dodatkowe formaty CAD i profesjonalnych programów.
- Integracje z zewnętrznymi aplikacjami.
- Zaawansowane funkcje poligraficzne.
- Rozszerzona automatyzacja.
- Dodatkowe interfejsy wykorzystujące ten sam silnik.

# 13. KRYTERIA AKCEPTACJI FUNKCJI

Każda funkcja przed uznaniem jej za ukończoną musi spełniać następujące wymagania:

1. Posiada jasno zdefiniowany zakres funkcjonalny.
2. Korzysta ze wspólnego modelu dokumentu i API.
3. Obsługuje błędy i nieprawidłowe dane.
4. Nie powoduje niekontrolowanego zużycia pamięci.
5. Ma testy jednostkowe lub integracyjne odpowiednie do rodzaju operacji.
6. Ma udokumentowane ograniczenia.
7. Nie deklaruje zgodności, której nie potwierdzono testami.
8. Jest zgodna z architekturą adapterów.
9. Jest możliwa do rozszerzenia bez przepisywania całego silnika.
10. Nie narusza zasad bezpieczeństwa ani licencji zależności.
