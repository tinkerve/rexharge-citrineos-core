# Scripted OCPP 1.6 charger (REX-96)

A scripted charger that drives a real CitrineOS (API, OCPP 1.6 websocket, RabbitMQ, Postgres) through a
charging session and a remote stop, then checks what the charger received and what CitrineOS wrote to the
database. It was grown from the REX-96 incident repro (MyTown AC 001, 2026-11-21).

## Scenarios

| Scenario        | What happens                                                                                                                                                                 | Pass condition                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctrl`          | Charger replies `Accepted` to RemoteStop, waits 1 s, sends StopTransaction (no overlap).                                                                                     | StopTransaction gets a CALLRESULT; transaction inactive with one `StopTransactions` row.                                                                                                                    |
| `late`          | Charger sends StopTransaction **before** replying to RemoteStop (the CSMS call is still open).                                                                               | Same as `ctrl`.                                                                                                                                                                                             |
| `prod`          | Charger replies `Accepted`, a second RemoteStop is fired at once; it sends StopTransaction as soon as the duplicate arrives, then answers it `Rejected`. The incident order. | Same as `ctrl`, and both RemoteStops (different message ids) reach the charger.                                                                                                                             |
| `overlap`       | A second socket connects while the first is still open; the first dies only after the second registered.                                                                     | One connection's queues, station online, RemoteStop received once, transaction closed; a final normal disconnect deletes the queues and marks the station offline.                                          |
| `dup-open`      | The RemoteStop delivery is published to RabbitMQ again (same message id) while the first copy is outstanding.                                                                | Charger receives RemoteStop once; transaction closed.                                                                                                                                                       |
| `dup-answered`  | The same, 3 ms after the charger answered the first copy (the incident timing).                                                                                              | Same as `dup-open`.                                                                                                                                                                                         |
| `orphan`        | Transaction started, connector reports `Finishing` then `Available`, no StopTransaction.                                                                                     | After the orphan timeout: inactive, `stoppedReason` `Other`, end time = charger time of the first `Available`, no invented `StopTransactions` row; next StartTransaction with the same idTag is `Accepted`. |
| `orphan-stop`   | As `orphan`, but StopTransaction arrives 2 s after `Available`.                                                                                                              | Closed normally (`stoppedReason` `Remote`), the orphan close does not fire.                                                                                                                                 |
| `orphan-skew`   | As `orphan`, with the charger clock 8 h ahead of the server.                                                                                                                 | Closed; end time is the charger time of the first `Available`.                                                                                                                                              |
| `orphan-old`    | As `orphan`, but the transaction was created 25 h ago (older than `orphanTransactionMaxAgeHours`).                                                                           | Left active.                                                                                                                                                                                                |
| `orphan-201`    | As `orphan`, with the station marked OCPP 2.0.1.                                                                                                                             | Left active (the closer handles OCPP 1.6 only).                                                                                                                                                             |
| `orphan-plugin` | As `orphan`, but the next driver plugs in (connector `Preparing`) 3 s after `Available`.                                                                                     | Old transaction still closed after the timeout, end time = first `Available`; next driver starts normally.                                                                                                  |
| `orphan-next`   | As `orphan`, but the next driver (another card) starts a session 3 s after `Available`.                                                                                      | Old transaction closed at once (`Other`, end time = first `Available`); new one stays active, then stops normally.                                                                                          |
| `triple`        | Three sockets for the station open at once.                                                                                                                                  | Exactly one stays open with one connection's queues, station online, RemoteStop received once, final disconnect deletes the queues.                                                                         |

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

Start CitrineOS (leave it running in its own terminal; restart it after every `npm run build`):

```bash
Server/test/scripted-charger/run-citrine.sh
```

The rig config sets the orphan transaction timeout to 10 s (`RIG_ORPHAN_TIMEOUT_SECONDS`); the
orphan scenarios wait 18 s (`ORPHAN_WAIT_MS`).

`delete-missing-queue.cjs` checks that the broker treats deleting a missing queue as a no-op and
keeps the channel open (the on-connect queue sweep relies on it). Re-run `rig-config.cjs` after changing it.

Run the scenarios:

```bash
for s in ctrl late prod overlap dup-open dup-answered orphan orphan-stop orphan-skew orphan-old orphan-201 orphan-plugin orphan-next triple; do node Server/test/scripted-charger/charger.cjs $s || echo "$s FAILED"; done
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
| `AMQP_URL`, `AMQP_EXCHANGE`                                    | `amqp://guest:guest@localhost:5672`, `citrineos`     |
| `RABBIT_MGMT`                                                  | `http://guest:guest@localhost:15672`                 |
| `ORPHAN_WAIT_MS`                                               | `18000`                                              |
| `RIG_ORPHAN_TIMEOUT_SECONDS` (rig-config)                      | `10`                                                 |
| `RIG_PORT_OFFSET` (rig-config)                                 | `10000`                                              |
| `RIG_DB_PORT`, `RIG_AMQP_PORT`, `RIG_AMQP_MGMT_PORT` (compose) | `15433`, `5672`, `15672`                             |
