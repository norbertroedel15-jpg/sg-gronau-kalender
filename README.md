# Vereinskalender SG Gronau · Abteilung Fußball

Gemeinsamer Kalender mit echter Anmeldung und zentraler SQLite-Datenbank.

## Was funktioniert?

- Jede Person bekommt ein eigenes Konto. Keine öffentliche Registrierung.
- Die Vereinsverwaltung legt weitere Zugänge im Kalender an.
- Alle angemeldeten Personen sehen denselben Kalender und können alle Termine anlegen, bearbeiten und löschen.
- Neue Termine sind sofort gespeichert. Andere geöffnete Kalender gleichen sich alle 15 Sekunden ab; „Aktualisieren“ lädt sofort.
- Monat wechseln, Terminarten filtern, Details öffnen und auf Handy oder Computer nutzen.
- Passwörter werden mit scrypt gehasht, Sitzungscookies sind HttpOnly; Sitzungen enden nach 24 Stunden.
- Gleichzeitige Änderungen werden erkannt. Bei einem Konflikt den Termin neu öffnen.
- Der echte Kalender beginnt leer. Die alten Beispiele werden nicht als echte Vereinstermine übernommen.

## Wichtig für den gemeinsamen Betrieb

Der Code ist für einen einzelnen dauerhaft laufenden Server mit **Node.js 24** und einem **dauerhaften Datenträger** vorgesehen. Alle Personen öffnen dieselbe HTTPS-Adresse. GitHub speichert den Programmcode; GitHub Pages kann diese Serveranwendung nicht betreiben.

Es ist noch kein Online-Hostingkonto verbunden. Eine Veröffentlichung muss im gewünschten Hostingkonto erfolgen. Kosten hängen vom Anbieter ab. Keine Passwörter in GitHub oder im Chat hinterlegen.

## Lokal starten (für die Einrichtung)

```bash
npm ci
```

Ein erstes Verwaltungskonto anlegen. Im Terminal wird das Passwort verdeckt abgefragt:

```bash
read -r -p 'E-Mail: ' ADMIN_EMAIL
read -r -s -p 'Passwort (mindestens 12 Zeichen): ' ADMIN_PASSWORD
printf '\n'
export ADMIN_EMAIL ADMIN_PASSWORD
npm run admin
unset ADMIN_EMAIL ADMIN_PASSWORD
npm run build
npm start
```

Danach http://127.0.0.1:3000 öffnen und anmelden. Über „Zugänge verwalten“ weitere Personen hinzufügen. Zugangsdaten persönlich weitergeben; keine Sammelkonten verwenden.

Zum Entwickeln: `npm run server` und in einem zweiten Terminal `npm run dev`. Vite leitet `/api` an Port 3000 weiter.

## Online veröffentlichen

Ein Node-/Docker-Webdienst mit persistentem Datenträger und HTTPS wird benötigt, zum Beispiel ein entsprechender Tarif bei Render oder ein eigener Server. Die Anwendung auf **einer Instanz** betreiben. Keine flüchtige Serverless-Funktion verwenden.

Konfiguration:

| Variable | Bedeutung |
| --- | --- |
| `NODE_ENV` | Im Onlinebetrieb `production`; aktiviert Secure-Cookies, benötigt HTTPS |
| `HOST` | Beim Hoster `0.0.0.0` |
| `PORT` | Vom Hoster vorgegeben oder `3000` |
| `DB_PATH` | Datei auf dauerhaftem Datenträger, zum Beispiel `/app/data/calendar.sqlite` |
| `APP_ORIGIN` | Exakte öffentliche Adresse ohne abschließenden Schrägstrich, z. B. `https://kalender.beispiel.de` |

Ohne Docker: Build `npm ci && npm run build`, Start `npm start`. Node.js 24 verwenden. Mit Docker: die beigefügte Dockerfile verwenden und einen beschreibbaren Datenträger unter `/app/data` einhängen (Benutzer `node`, UID 1000).

Das erste Verwaltungskonto **einmalig auf dem Server** mit `npm run admin` beziehungsweise `node server/server.mjs --create-admin` anlegen. Dabei `ADMIN_EMAIL` und `ADMIN_PASSWORD` vorübergehend im geschützten Terminal setzen, wie oben beschrieben. Dieselbe `DB_PATH` wie beim laufenden Dienst verwenden. Danach die Variablen entfernen.

## Passwort vergessen / Person verlässt den Verein

Der aktuelle Stand bietet keinen E-Mail-Passwortversand und keine selbstständige Passwortwiederherstellung. Die Serververwaltung kann mit `--reset-password` ein neues Passwort setzen und beendet dabei alle Sitzungen dieses Kontos:

```bash
# ADMIN_EMAIL und ADMIN_PASSWORD wie oben verdeckt abfragen und exportieren
node server/server.mjs --reset-password
unset ADMIN_EMAIL ADMIN_PASSWORD
```

Um ein Konto zu sperren: `ACCOUNT_EMAIL` im Serverterminal setzen, dann `node server/server.mjs --disable-user` ausführen. Das Konto bleibt als gesperrt erhalten, alle Sitzungen werden beendet. Der letzte aktive Administrator kann nicht gesperrt werden. Zum Entsperren das Passwort wie oben zurücksetzen.

## Sicherung

Die Datei unter `DB_PATH` enthält die Vereinsdaten und muss regelmäßig gesichert werden. Für eine einfache konsistente Dateisicherung den Dienst stoppen und den ganzen Datenordner (einschließlich gegebenenfalls vorhandener `-wal`/`-shm`-Dateien) kopieren. Alternativ SQLite-Onlinesicherung verwenden. Wiederherstellung regelmäßig prüfen. Datenbank und Sicherungen nicht auf GitHub hochladen.

## Prüfung

```bash
npm test
npm run lint
npm run build
```

Der Integrationstest prüft zwei getrennte Konten, gemeinsame Termine, Eingabeprüfung, Zugriffsschutz, fremde Herkunft, Bearbeitungskonflikte, Abmelden und Datenerhalt nach Neustart. Noch nicht enthalten: getrennte Lese-/Schreibrollen, Serientermine, automatische E-Mails und Mannschaftsverwaltung.
