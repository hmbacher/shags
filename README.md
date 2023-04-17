# Allgemein
Der Service ***S**marthome **H**ealth **Ag**gegator **S**ervice (SHAGS)* wird als Docker Container App über [Docker Compose](https://docs.docker.com/compose/) gesteuert. Er ist grundsätzlich unabhängig von anderen Docker-Containern, -Netzwerken oder -Compose-Setups, wird aber im Verbund zur Überwachung anderer Container eingesetzt.

Die NodeJS-App nutzt [Express](https://expressjs.com/de/) und [dockerode](https://github.com/apocas/dockerode).

# Voraussetzungen
* QNAP-NAS oder vergleichbares Host-System mit Docker Engine und Docker Compose Plugin.
* SSH-Verbindung zum Host-System (oder andere Konfigurationsmöglichkeit).
* Gültige SSL-Zertifikate (siehe auch Abschnitt [Zertifikate](#zertifikate)).

# Installation
Im folgenden wird die Installtion auf einem QNAP-NAS beschrieben. Das Setup auf anderen Hosts ist analog.

## GitHub-Repository
1. Basis-Ordner - z.B. mit dem Namen *'tech'* - und Netzwerk-Freigabe auf NAS anlegen und Netzwerk-Zugriff vom PC auf den Ordner prüfen.
2. Am PC in der *Windows Powershell* folgende Befehle ausführen (da in *WSL2* die Netzwerkfreigaben als Mount im Zusammenspiel mit *git* nicht richtig funktionieren):

        cd //aztectemple/tech
        git clone git@github.com:hmbacher/shags.git

## Konfiguration
Für die folgenden Konfigurationen kann entweder eine IDE (z.B. VSCode) verwendet werden, die Remote-Zugriff über SSH unterstützt, oder die Konfigurationen können mit den gängigen Kommandozeilen-Befehlen und -Werkzeugen erfolgen.

### Environment
Im *shags*-Basis-Verzeichnis eine `.env`-Datei anlegen (abgeleitet von `.env.template`):
```bash
cp .env.template .env
```
In dieser Datei, die von Docker Compose genutzt wird, werden die folgenden Konfigurationen vorgenommen.

### SSL-Zertifikate (optional)
Die NodeJS-App stellt einen HTTPS-Server bereit und benötigt SSL-Zertifikate, die dem jeweiligen Domain-Setup entsprechen. Die Namen und der Host-Ablageort der Zertifikate werden über die entsprechenden Umgebungsvariablen in der `.env`-Datei konfiguriert.
```bash
# --SSL
SSL_SRC_DIR=/share/smarthome/certs
SSL_CERT_FILENAME=bacher.digital-wc-fullchain.pem
SSL_KEY_FILENAME=bacher.digital-wc-privkey.pem
SSL_DIR=/etc/mycerts
SSL_CERT=${SSL_DIR}/${SSL_CERT_FILENAME}
SSL_KEY=${SSL_DIR}/${SSL_KEY_FILENAME}
```
Die Bereitstellung der Zertifikate an den *shags*-Container erfolgt über [Docker bind mounts](https://docs.docker.com/storage/bind-mounts/) (siehe `docker-compose.yml`).

### Logging (optional)
Das vorliegende Docker Compose Setup setzt auf eine vorhandene [Grafana Loki](https://grafana.com/oss/loki/)-Instanz (die z.B. im [Smarthome](https://github.com/hmbacher/smarthome) App-Verbund bereitgestellt wird).
```bash
# --Logging
LOKI_PORT=3100
LOKI_SERVER=loki:${LOKI_PORT}
```
Soll nicht Grafana Loki verwendet werden, muss die Datei `docker-compose.yml` antsprechend angepasst werden.

### Ports
Falls erforderlich, können die Ports angepasst werden:
```bash
# --Ports
PORT_OUTER=7444
PORT_INNER=7444
```

## shags-Image bauen

Falls das *shags*-Image nicht aus früheren Setups vorhanden ist, muss dieses erstellt werden:

1. SSH-Verbindung zur QNAP-NAS herstellen, z.B.

        ssh hans@aztectemple.fritz.box

2. In das entsprechende Verzeichnis wechseln, z.B.

        cd /share/tech/shags/tfrec/image

3. Docker-Image `shags-http` (oder analog `shags-https`) bauen

        docker build -t shags-http .
        docker images

## shags ausführen

### Als QNAP Container Station App (empfohlen)
Damit QNAP *shags* zuverlässig und auch nach NAS-Neustarts selbstständig wieder ausführt, sollte über das QNAP Web-Frontend und die Container Station eine *App* erstellt werden.

1. Ggf. SSH-Verbindung zur QNAP-NAS herstellen, z.B.:

        ssh hans@aztectemple.fritz.box

2. App-Konfiguration aus Docker Compose-File erstellen:

        cd /share/tech/shags
        docker-compose config > docker-compose.qnap.yml

3. Den Inhalt von `docker-compose.qnap.yml` in den **Create Application**-Dialog eintragen und als *Application name* z.B. *'shags'* angeben.

    ![QNAP Create Application Dialog](/docs/images/qnap_container_station_create_app.png)

### Manuell starten/stoppen (nur zu Test-Zwecken)

1. Ggf. SSH-Verbindung zur QNAP-NAS herstellen, z.B.:

        ssh hans@aztectemple.fritz.box

2. *shags* starten:

        cd /share/tech/shags
        docker-compose up -d

3. *shags* stoppen:

        docker-compose down

# Endpunkte

## /health

Der Endpunkt gibt den Health-Status von Containern zurück, sofern ein [Docker Healthcheck](https://docs.docker.com/compose/compose-file/#healthcheck) implementiert ist, und ansonsten den [Container State](https://docs.docker.com/engine/api/v1.42/#tag/Container/operation/ContainerList).

Der optionale Query Parameter `asnum` gibt an, ob der Health-Status (oder Container State) als Zeichenketten (originale Docker-Bezeichner) zurückgegeben werden, oder als Nummern. Ist `asnum=true` gesetzt, wird `'1'` zurückgegeben, wenn der Health-Status `'healthy'` ist (bzw. der Container State `'running'`), und in allen anderen Fällen `'0'`.

Der optionale Query-Parameter `idlist` übergibt eine kommaseparierte Liste von Container-IDs oder -Namen, deren Health-Status geprüft werden soll.  
Wird der Parameter angegeben, werden ausschließlich die übergebenen Container geprüft. Kann zu einem Container kein Health-Status ermittelt werden (z.B. weil kein Container mit der angegeben ID existiert), wird ein entsprechendes Ergebnis zurückgegeben (bei `asnum=true` wird anstatt einer Zeichenkette `'0'` zurückgegeben), siehe auch Beispiele *3* und *4*.  
Wird der Parameter *nicht* genutzt, werden alle vorhandenen Container im Docker Host ermittelt und ausgewertet.

**Beispiel 1 - Alle Container (*portainer* ohne Healthcheck)**
```
https://.../health
```
```json
{
    "shags": "healthy",
    "portainer": "running",
    "tfrec": "healthy",
    "telegraf": "healthy",
    "influxdb": "healthy",
    "grafana-loki": "healthy",
    "eprice": "healthy",
    "npm": "healthy",
    "grafana": "healthy"
}
```

**Beispiel 2 - Alle Container (*portainer* ohne Healthcheck), Ergebnisse als Nummern**
```
https://.../health?asnum=true
```
```json
{
    "shags": 1,
    "portainer": 1,
    "tfrec": 1,
    "telegraf": 1,
    "influxdb": 1,
    "grafana-loki": 1,
    "eprice": 1,
    "npm": 1,
    "grafana": 1
}
```

**Beispiel 3 - Bestimmte Container, inkl. nicht existenten**
```
https://.../health?idlist=npm,grafana,telegraf,xyz
```
```json
{
    "grafana": "healthy",
    "telegraf": "healthy",
    "npm": "healthy",
    "xyz": "Failure: Could not determine information for requested container id."
}
```

**Beispiel 4 - Bestimmte Container, inkl. nicht existenten, Ergebnisse als Nummern**
```
https://.../health?idlist=npm,grafana,telegraf,xyz
```
```json
{
    "grafana": 1,
    "telegraf": 1,
    "npm": 1,
    "xyz": 0
}
```

## /health/{id}

Der Endpunkt gibt den Health-Status des Containers mit der ID (oder dem Namen) `{id}` zurück, sofern ein [Docker Healthcheck](https://docs.docker.com/compose/compose-file/#healthcheck) implementiert ist, und ansonsten den [Container State](https://docs.docker.com/engine/api/v1.42/#tag/Container/operation/ContainerList).

Der optionale Query Parameter `asnum` gibt an, ob der Health-Status (oder Container State) als Zeichenketten (originale Docker-Bezeichner) zurückgegeben werden, oder als Nummern. Ist `asnum=true` gesetzt, wird `'1'` zurückgegeben, wenn der Health-Status `'healthy'` ist (bzw. der Container State `'running'`), und in allen anderen Fällen `'0'`.

Existiert der angegeben Container im Docker Host nicht, wird ein ensprechender Fehler an den Client gesendet.

**Beispiel 1**
```
https://.../health/grafana
```
```json
{
    "status": "healthy"
}
```

**Beispiel 2 - Ergebnisse als Nummern**
```
https://.../health/grafana?asnum=true
```
```json
{
    "status": 1
}
```

**Beispiel 3 - Container existiert nicht**
```
https://.../health/zyx
```
```json
{
    "message": "No such container: zyz"
}
```

## /state

Stellt zu allen Containern den aktuellen [Container State](https://docs.docker.com/engine/api/v1.42/#tag/Container/operation/ContainerList) bereit.

Der State wird als Zeichenkette (originale Docker-Bezeichner) zurückgegeben, wenn der optionale Query-Parameter `asnum` nicht genutzt wird. Ist hingegen `asnum=true` gesetzt, wird `'1'` für Container im State `'running'` zurückgegeben und `'0'` für alle anderen States. 

**Beispiel 1**
```
https://.../state
```
```json
{
    "shags": "running",
    "portainer": "running",
    "tfrec": "running",
    "telegraf": "running",
    "grafana": "running",
    "influxdb": "running",
    "grafana-loki": "running",
    "eprice": "running",
    "npm": "running",
    "allRunning": true
}
```

**Beispiel 2 - Ergebnisse als Nummern**
```
https://.../state?asNum=true
```
```json
{
    "shags": 1,
    "portainer": 1,
    "tfrec": 1,
    "telegraf": 1,
    "grafana": 1,
    "influxdb": 1,
    "grafana-loki": 1,
    "eprice": 1,
    "npm": 1,
    "allRunning": 1
}
```

## /diag

Der Endpunkt dient dem [Docker Healthcheck](https://docs.docker.com/compose/compose-file/#healthcheck). Er liefert den Text `'OK'` mit HTTP-Status `200` und beweist damit eine ordnungsgemäße Funktion des Web Servers.