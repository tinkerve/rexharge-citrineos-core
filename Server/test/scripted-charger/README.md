# Scripted OCPP 1.6 charger (REX-96)

A scripted charger that drives a real CitrineOS (API, OCPP 1.6 websocket, RabbitMQ, Postgres) through a
charging session and a remote stop, then checks what the charger received and what CitrineOS wrote to the
database. It was grown from the REX-96 incident repro (MyTown AC 001, 2026-11-21).

## Scenarios

| Scenario | What the charger does                                                                                                                                             | Pass condition                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ctrl`   | Replies `Accepted` to RemoteStop, waits 1 s, sends StopTransaction (no overlap).                                                                                  | StopTransaction gets a CALLRESULT; transaction inactive with one `StopTransactions` row. |
| `late`   | Sends StopTransaction **before** replying to RemoteStop (the CSMS call is still open).                                                                            | Same as `ctrl`.                                                                          |
| `prod`   | Replies `Accepted`, a second RemoteStop is fired at once; sends StopTransaction as soon as the duplicate arrives, then answers it `Rejected`. The incident order. | Same as `ctrl`.                                                                          |

Exit code: `0` passed, `1` an assertion failed, `2` timeout or connection error.

Each run registers a fresh random idTag (`Authorizations`) and, if missing, EVSE 1 / connector 1 of the
station, so runs do not trip over each other (`ConcurrentTx`) and work on an empty database.

## Running the local rig

Infrastructure runs in Docker; CitrineOS runs on the host from this checkout, so a code change only needs a
rebuild and restart. Ports are the `local` config ports plus 10000 (API `18080`, OCPP 1.6 `18092`).

```bash
npm ci && npm run build
docker compose -f Server/test/scripted-charger/docker-compose.rig.yml up -d --wait
node Server/test/scripted-charger/rig-config.cjs Server/test/scripted-charger/.rig
BOOTSTRAP_CITRINEOS_DATABASE_PORT=15433 npm run migrate
```

Start CitrineOS (leave it running in its own terminal):

```bash
cd Server && APP_NAME=all APP_ENV=local BOOTSTRAP_CITRINEOS_DATABASE_PORT=15433 BOOTSTRAP_CITRINEOS_CONFIG_FILENAME=config.json BOOTSTRAP_CITRINEOS_CONFIG_DIR=test/scripted-charger/.rig BOOTSTRAP_CITRINEOS_FILE_ACCESS_TYPE=local BOOTSTRAP_CITRINEOS_FILE_ACCESS_LOCAL_DEFAULT_FILE_PATH=. node ./dist/index.js
```

Run the scenarios:

```bash
for s in ctrl late prod; do node Server/test/scripted-charger/charger.cjs $s || echo "$s FAILED"; done
```

Tear down (drops the rig database):

```bash
docker compose -f Server/test/scripted-charger/docker-compose.rig.yml down -v
```

## Environment

| Variable                                                       | Default                                              |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| `CITRINE_API`                                                  | `http://localhost:18080`                             |
| `CITRINE_WS`                                                   | `ws://localhost:18092`                               |
| `STATION`                                                      | `testing`                                            |
| `TENANT_ID`                                                    | `1`                                                  |
| `IDTAG`                                                        | random per run                                       |
| `DATABASE_URL`                                                 | `postgres://citrine:citrine@localhost:15433/citrine` |
| `RIG_PORT_OFFSET` (rig-config)                                 | `10000`                                              |
| `RIG_DB_PORT`, `RIG_AMQP_PORT`, `RIG_AMQP_MGMT_PORT` (compose) | `15433`, `5672`, `15672`                             |
