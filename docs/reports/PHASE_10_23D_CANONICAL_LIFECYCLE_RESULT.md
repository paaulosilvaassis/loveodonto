# PHASE 10.23D — Canonical legal lifecycle domain

**Commit alvo:** a ser preenchido no git  
**Escopo:** estados, normalização, transições, guards. Sem writers VOID/REISSUE.

## Autoridade

`src/contracts/lifecycle/` é a única fonte. `contractLifecycleGuard.js` delega.

## Cerimônia

HYBRID. Persistido: `metadata.signatureCeremony.status`.  
Derivado: `not_started`, `awaiting_remote`, `aborted`. Sem persistência nova.

## Writers

VOID/SUPERSEDE/REISSUE: definidos no grafo, `WRITER_IMPLEMENTED = false`.  
REISSUE exige `oldContractId !== newContractId`.

## Regression

10.23C: PASS. phase1021l: FAIL preexistente inalterado (`sendContractForSignature` sem `requestId`).

## Dados

DATABASE_MIGRATION = NONE  
BACKFILL = NONE  
PRODUCTION_DATA_MUTATION = ZERO
