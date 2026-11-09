# Kostenlos und werbefrei mit Cloudflare

Der Kalender kann unabhängig von der Vereinshomepage unter einer kostenlosen `workers.dev`-Adresse laufen. Frontend und API laufen in einem Worker; Cloudflare D1 speichert die gemeinsamen Termine, Konten und Sitzungen dauerhaft. Kein Werbeskript wird eingebunden.

**Stand: Die Anwendung läuft unter https://sg-gronau-kalender.norbertroedel15.workers.dev/.** Die folgende Anleitung dokumentiert auch die Einrichtung einer weiteren Instanz. Ein kostenloses Cloudflare-Konto ist erforderlich. Der kostenlose Tarif hat Nutzungsgrenzen; das ist keine Garantie für unbegrenzten oder dauerhaft kostenlosen Betrieb. Kein Upgrade und keine kostenpflichtige Domain nötig. Vor einem Tarifwechsel immer den Preis bestätigen.

## Einmalige Einrichtung (mit technischer Begleitung)

1. Im eigenen Cloudflare-Konto den Tarif **Workers Free** verwenden.
2. Im Projekt mit Node.js 24 `npm ci` ausführen.
3. Mit `npx wrangler login` im eigenen Browser autorisieren. Keine API-Schlüssel oder Passwörter im Chat versenden.
4. Datenbank anlegen:

   ```bash
   npx wrangler d1 create sg-gronau-kalender
   ```

   Die zurückgegebene `database_id` in `wrangler.jsonc` anstelle der Null-UUID eintragen. Die Bindung heißt weiterhin `DB`. Die ID ist kein Passwort. Ohne diese Änderung nicht veröffentlichen.

5. Zwei **verschiedene**, zufällige Geheimnisse mit mindestens 32 Zeichen erzeugen, zum Beispiel im Passwortmanager. Geschützt aufbewahren. Mit den folgenden Befehlen jeweils verdeckt an Cloudflare übergeben:

   ```bash
   npx wrangler secret put PASSWORD_PEPPER
   npx wrangler secret put SETUP_TOKEN
   ```

   `PASSWORD_PEPPER` schützt die gespeicherten Passwortableitungen zusätzlich. Nicht einfach ändern oder löschen: die bestehenden Passwörter würden dadurch ungültig. `SETUP_TOKEN` ist ausschließlich der Einrichtungscode für das erste Verwaltungskonto. Keine Geheimnisse in GitHub, Konfigurationsdateien oder Screenshots veröffentlichen.

6. Datenbanktabellen einrichten und veröffentlichen:

   ```bash
   npm run cf:migrate:remote
   npm run cf:deploy
   ```

   Die Veröffentlichung verbindet die gebaute Oberfläche und den Worker mit der D1-Datenbank. Die Befehle schließen keinen kostenpflichtigen Tarif ab; im Cloudflare-Konto weiterhin Free verwenden. Accountweite Limits beachten.

7. Die ausgegebene HTTPS-Adresse öffnen. Auf **Erstmalige Einrichtung** klicken. Einrichtungscode, eigenen Namen, E-Mail und ein neues Passwort (12–128 Zeichen) eingeben. Danach normal anmelden. Das erste Konto erhält Verwaltungsrechte. Eine atomare Datenbankanweisung verhindert weitere Erstkonten, auch bei gleichzeitigen Anfragen.
8. Nach erfolgreicher Einrichtung `SETUP_TOKEN` entfernen:

   ```bash
   npx wrangler secret delete SETUP_TOKEN
   ```

   Die normale Anmeldung bleibt verfügbar. Der Einrichtungsknopf wird ausgeblendet, sobald ein Konto existiert. Keine öffentliche Selbstregistrierung.
9. Unter **Zugänge verwalten → Person einladen** Namen und E-Mail eintragen, **Einladungslink erstellen** und **Link kopieren** wählen. Den Link persönlich an die vorgesehene Person weitergeben. Sie legt darüber ihr eigenes Passwort fest und wird anschließend angemeldet. Es wird keine E-Mail automatisch versendet.

## Was die Vereinsverwaltung selbst erledigen kann

- Personen mit Name und E-Mail einladen, ohne ein Passwort für sie festzulegen.
- Mitgliederzugänge sperren; bestehende Sitzungen und Einladungslinks sind sofort ungültig.
- Für vorhandene Personen einen **Link für eigenes neues Passwort** erstellen. Die Person wählt das neue Passwort selbst; dabei enden ihre bisherigen Sitzungen. Ein gesperrter Zugang wird dadurch wieder aktiviert.
- Einladungslinks widerrufen oder neu erstellen. Ein neuer Link ersetzt den vorherigen.
- Alle Mitglieder können alle Termine ansehen, anlegen, bearbeiten und löschen.

### Einladungslinks

Links gelten sieben Tage und genau für eine Person. Sie sind nur einmal verwendbar. Öffnen oder Prüfen allein verbraucht den Link nicht; erst das erfolgreiche Speichern des Passworts aktiviert den Zugang. Ein bereits angemeldetes Mitglied kann bei Bedarf über einen neuen Link sein Passwort selbst neu wählen. Bis dahin bleiben sein bisheriges Passwort und seine Sitzungen gültig.

Wer den Link besitzt, kann das Passwort dieser Person festlegen. Den Link deshalb nur persönlich weitergeben und nicht öffentlich posten. Es erfolgt keine zusätzliche E-Mail-Verifikation. Der Link wird nur unmittelbar nach seiner Erstellung angezeigt; bei Verlust einen neuen erstellen. In der Datenbank wird nur der SHA-256-Hash des zufälligen Tokens gespeichert. Der Token steht im URL-Fragment, damit er nicht im normalen HTTP-Aufruf oder Referer erscheint.

Die Migration `0002_invitations.sql` ergänzt ausschließlich eine neue Tabelle und ihren Index; vorhandene Konten und Termine bleiben erhalten. Beim bisherigen Cloudflare-Build läuft weiterhin `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`. Vor dem Hochladen der neuen Worker-Version müssen die Migrationen angewandt sein.

Verwaltungskonten lassen sich in der Oberfläche nicht sperren. E-Mail-Passwortversand und automatische Wiederherstellungs-E-Mails sind nicht eingerichtet. Bei Verlust des einzigen Verwaltungspassworts ist Unterstützung durch die Cloudflare-Kontoinhaberin oder den Kontoinhaber erforderlich. Cloudflare-Kontozugang und `PASSWORD_PEPPER` deshalb geschützt aufbewahren.

## Eigene Terminarten

Die Vereinsverwaltung öffnet im Kalender **Terminarten verwalten**. Unter **Neue Terminart** Namen und Farbe eintragen und **Terminart anlegen** wählen. Die neue Art steht anschließend allen Mitgliedern im Terminformular, im Filter und in der Legende zur Verfügung. Bei sehr hellen Farben wird dunkle Schrift verwendet, damit der Text lesbar bleibt.

Namen und Farbe lassen sich mit **Bearbeiten** ändern. **Ausblenden** entfernt eine Art aus der Auswahl für neue Termine. Vorhandene Termine bleiben unverändert zugeordnet, sichtbar, filterbar und bearbeitbar. **Wieder anzeigen** macht die Art erneut auswählbar. Mindestens eine Art muss verfügbar bleiben. Es werden keine Terminarten mit vorhandenen Terminen gelöscht.

Die Migration `0003_event_types.sql` ergänzt die drei bisherigen Arten als Stammdaten und ersetzt die bisher auf drei Werte beschränkte Ereignistabelle durch eine Tabelle mit Verweis auf die Terminarten. Alle Spalten, IDs und Versionsnummern vorhandener Termine werden übernommen; Konten, Sitzungen und Einladungen bleiben unverändert. Die Datenübernahme wird im Integrationstest mit einem bereits vorhandenen Termin geprüft.

## Trainingsplanung und Serientermine

Auf der Kalenderseite stehen acht farbige Trainingsfelder bereit: 1. Mannschaft, AH, Bambini, F-, E-, D-, C-Jugend und Damen. Jede Kachel bietet **Training** für die wöchentliche Trainingsplanung und **Spiel** für einen einzelnen Spieltermin. Bei der 1. Mannschaft sind Dienstag und Donnerstag vorausgewählt, bei der AH Mittwoch. Für die übrigen Mannschaften sind keine Tage vorgegeben. Uhrzeit und Ort werden bewusst nicht für den Verein erfunden und müssen eingetragen werden.

**Serie anlegen:** Bei der Mannschaft **Training** wählen (oder bei **Neuer Termin** die Option **Wöchentlich wiederholen** aktivieren), Startdatum, Uhrzeit, Ort, Wochentage und Enddatum angeben. Eine Vorschau zeigt die Anzahl. **Serie anlegen** speichert sämtliche Vorkommen gemeinsam. Das Enddatum ist einschließlich, der Zeitraum ist auf maximal ein Jahr begrenzt. Für weitere Zeiträume kann eine zusätzliche Serie angelegt werden.

**Ändern:** Einen Serientermin öffnen und **Bearbeiten** wählen. Standardmäßig wird nur dieser Termin geändert, etwa bei einer Verlegung. Die Auswahl **Alle vorhandenen Termine dieser Serie** ändert Titel, Uhrzeit, Ort und Terminart für alle noch vorhandenen Vorkommen. Auch zuvor einzeln bearbeitete gemeinsame Felder werden dabei ersetzt. Die einzelnen Kalenderdaten und das Wiederholungsmuster bleiben erhalten; abgesagte/gelöschte Vorkommen werden nicht wieder angelegt. Für ein anderes Wiederholungsmuster eine neue Serie anlegen.

**Löschen:** Standardmäßig wird nur der gewählte Termin gelöscht. Mit **Gesamte Serie** und ausdrücklicher Bestätigung werden alle noch vorhandenen Vorkommen gelöscht. Andere Termine und Serien bleiben erhalten. Gleichzeitige Änderungen werden anhand von Termin- und Serienversionen erkannt; bei einem Konflikt den Termin neu öffnen.

Die Daten sind echte Kalenderdaten, werden monatsübergreifend gespeichert und beim Monatswechsel normal geladen. Die Berechnung verwendet kalenderfeste UTC-Daten für die Wochentage, während die eingegebenen Trainingszeiten als örtliche Uhrzeiten erhalten bleiben. Dadurch verschieben Sommerzeitwechsel die Trainingszeiten nicht.

**Spiel eintragen:** Unter **Training und Spiel planen** bei der gewünschten Mannschaft **Spiel** wählen. Das Formular wählt automatisch die Spielart dieser Mannschaft und beginnt als Einzeltermin. Im Titel kann der Gegner ergänzt werden; Datum, Uhrzeit und Ort werden vom Trainer eingetragen. Alle Mitglieder mit Zugang können Training und Spiele eintragen, es sind keine Verwaltungsrechte nötig.

Die allgemeine Schaltfläche **Training** in der oberen Farbleiste ist ausgeblendet. Die allgemeine Art bleibt für vorhandene Termine und im Terminfilter erhalten. Migration `0005_team_games.sql` ergänzt acht zugehörige Spielarten und verknüpft sie mit den Mannschaftskacheln; bestehende Termine und Serien werden nicht verändert. Gleichnamige vorhandene Spielarten werden wiederverwendet.

Migration `0004_recurring_training.sql` ergänzt Mannschaftsarten, Serien und eine nullable Serienzuordnung für Termine. Bestehende Einzeltermine bleiben Einzeltermine. Bereits vorhandene gleichnamige Arten werden verwendet; ihre Namen und Farben werden nicht überschrieben. Es werden keine echten Trainingstermine ohne Uhrzeit, Ort und Zeitraum angelegt. Die Farben lassen sich weiter über **Terminarten verwalten** ändern.

## Sparsamer Datenabgleich

Es werden nur die Termine des gewählten Monats abgefragt, über einen Datenbankindex. Geöffnete Kalender gleichen sich jede Minute ab. Verborgene Tabs pausieren den regelmäßigen Abgleich; beim Zurückkehren werden die Daten erneut geladen. **Aktualisieren** lädt sofort. So werden weniger kostenlose Anfragen verbraucht. Die Speicherung erfolgt sofort, unabhängig vom Anzeigeabgleich.

Die Free-Grenzen gelten auch für andere Worker/Datenbanken desselben Kontos. Werden Grenzen erreicht, kann der Kalender vorübergehend nicht erreichbar sein. Der Code aktiviert keinen Bezahlplan und führt keine automatische Tarifbuchung durch.

## Sicherung und Wiederherstellung

Eine Datenbank auf dem Server ist keine eigene Sicherung. Vor wichtigen Änderungen und regelmäßig:

```bash
npm run cf:backup
```

Das exportiert die echte Cloudflare-Datenbank als SQL nach `backups/`. Dort stehen auch Namen, E-Mail-Adressen und Passwortableitungen; Dateien privat und außerhalb des Servers aufbewahren, nicht zu GitHub hochladen. `backups/` ist ausgeschlossen. `PASSWORD_PEPPER` separat sichern. Die SQL-Sicherung allein ermöglicht ohne diesen Schlüssel keine Passwortprüfung.

Wiederherstellung zunächst in einer **neuen leeren D1-Datenbank** testen. Die SQL-Datei über `wrangler d1 execute <Datenbankname> --remote --file <Sicherung.sql>` importieren, anschließend deren ID in `wrangler.jsonc` eintragen und neu veröffentlichen. Nicht unbesehen über eine befüllte Datenbank importieren. Nach einer Wiederherstellung alle Sitzungen mit `DELETE FROM sessions` in der Datenbank beenden. Cloudflare D1 bietet zusätzlich Time Travel; die aktuell für Free geltende Aufbewahrungszeit im Konto prüfen.

## Lokale Prüfung ohne Onlinekonto

```bash
npm ci
cp .dev.vars.example .dev.vars
# In .dev.vars zwei unterschiedliche lokale Zufallswerte einsetzen.
npm run cf:migrate:local
npm run cf:dev
```

Dann http://127.0.0.1:8787 öffnen. Das ist eine lokale Vorschau; andere Personen können diese Adresse nicht verwenden. Lokale und veröffentlichte Datenbanken sind getrennt. `.dev.vars` und `.wrangler/` bleiben außerhalb von Git.

```bash
npm test
npm run lint
npm run cf:check
```

`cf:check` baut die Oberfläche und prüft das Cloudflare-Paket ohne Veröffentlichung. Der Cloudflare-Integrationstest läuft im lokalen Workerd/Miniflare mit echter D1-SQLite-Semantik, getrennten Konten, paralleler Einrichtung und Bearbeitung, einem Neustart, Berechtigungen und Sperrung. Die CPU-Abrechnung des kostenlosen Onlinetarifs kann erst nach Veröffentlichung im echten Konto gemessen werden.

## Bestehende Node-Version

`server/server.mjs` und die Dockerfile bleiben als alternative Betriebsart erhalten. Die dortige SQLite-Datei wird nicht automatisch zu Cloudflare hochgeladen. Bisher wurden nur Testdaten angelegt und kein Livebetrieb eingerichtet. Falls später echte Bestandsdaten übernommen werden sollen, Konten und Passwortformat separat migrieren; die Node-Version verwendet scrypt, der Worker PBKDF2-SHA256 mit serverseitigem HMAC-Pepper. Kein stilles Übernehmen unkompatibler Passwörter.
