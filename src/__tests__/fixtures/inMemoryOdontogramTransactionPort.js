import { OdontogramCommandError, ODONTOGRAM_COMMAND_ERROR_CODES as E } from '../../domain/odontogram/persistenceContract.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function snapshotOf(state) {
  return clone(state);
}

export function createInMemoryOdontogramTransactionPort(options = {}) {
  const state = options.state || {
    charts: [],
    events: [],
    toothStates: [],
    versions: [],
  };
  const failOn = options.failOn || null;

  function maybeFail(method) {
    if (failOn === method) {
      throw new OdontogramCommandError(E.TRANSACTION_FAILED, 'Falha injetada do adapter.');
    }
  }

  function createTx() {
    return {
      async getChartForUpdate({ chartId }) {
        const row = state.charts.find((item) => item.id === chartId);
        return row ? clone(row) : null;
      },
      async getActiveChart({ tenantId, patientId }) {
        const row = state.charts.find(
          (item) => item.tenantId === tenantId && item.patientId === patientId && !item.deletedAt,
        );
        return row ? clone(row) : null;
      },
      async getLatestEvent({ tenantId, chartId }) {
        const rows = state.events
          .filter((item) => item.tenantId === tenantId && item.chartId === chartId)
          .sort((left, right) => left.sequence - right.sequence);
        return rows.length ? clone(rows[rows.length - 1]) : null;
      },
      async listEventsOrdered({ tenantId, chartId }) {
        return clone(
          state.events
            .filter((item) => item.tenantId === tenantId && item.chartId === chartId)
            .sort((left, right) => left.sequence - right.sequence),
        );
      },
      async insertChart(row) {
        maybeFail('insertChart');
        const clash = state.charts.find(
          (item) => item.tenantId === row.tenantId && item.patientId === row.patientId && !item.deletedAt,
        );
        if (clash) {
          throw new OdontogramCommandError(E.ACTIVE_CHART_ALREADY_EXISTS, 'Chart ativo duplicado.');
        }
        state.charts.push(clone(row));
      },
      async insertEvent(row) {
        maybeFail('insertEvent');
        state.events.push(clone(row));
      },
      async updateToothStateProjection({ upserts, softDeletes }) {
        maybeFail('updateToothStateProjection');
        for (const upsert of upserts || []) {
          const index = state.toothStates.findIndex((item) => item.id === upsert.id);
          if (index >= 0) {
            state.toothStates[index] = {
              ...clone(upsert),
              rowVersion: (state.toothStates[index].rowVersion || 1) + 1,
            };
          } else {
            state.toothStates.push({ ...clone(upsert), rowVersion: 1 });
          }
        }
        for (const removed of softDeletes || []) {
          const index = state.toothStates.findIndex((item) => item.id === removed.id);
          if (index >= 0) {
            state.toothStates[index] = {
              ...state.toothStates[index],
              ...clone(removed),
              rowVersion: (state.toothStates[index].rowVersion || 1) + 1,
            };
          }
        }
      },
      async updateChartProjectionMetadata({ tenantId, chartId, expectedRowVersion, patch }) {
        maybeFail('updateChartProjectionMetadata');
        const index = state.charts.findIndex((item) => item.tenantId === tenantId && item.id === chartId);
        if (index < 0) throw new OdontogramCommandError(E.CHART_NOT_FOUND, 'Chart não encontrado.');
        if (state.charts[index].rowVersion !== expectedRowVersion) {
          throw new OdontogramCommandError(E.OPTIMISTIC_CONCURRENCY_CONFLICT, 'row_version obsoleto.');
        }
        state.charts[index] = {
          ...state.charts[index],
          ...clone(patch),
          rowVersion: state.charts[index].rowVersion + 1,
        };
      },
      async insertChartVersion(row) {
        maybeFail('insertChartVersion');
        state.versions.push(clone(row));
      },
      async loadCurrentToothStates({ tenantId, chartId }) {
        return clone(
          state.toothStates.filter((item) => item.tenantId === tenantId && item.chartId === chartId),
        );
      },
      async listChartVersions({ tenantId, chartId }) {
        return clone(
          state.versions
            .filter((item) => item.tenantId === tenantId && item.chartId === chartId)
            .sort((left, right) => left.versionNumber - right.versionNumber),
        );
      },
    };
  }

  return {
    state,
    snapshot: () => snapshotOf(state),
    restore(snapshot) {
      state.charts = clone(snapshot.charts);
      state.events = clone(snapshot.events);
      state.toothStates = clone(snapshot.toothStates);
      state.versions = clone(snapshot.versions);
    },
    async withTransaction(work) {
      const before = snapshotOf(state);
      try {
        return await work(createTx());
      } catch (err) {
        state.charts = clone(before.charts);
        state.events = clone(before.events);
        state.toothStates = clone(before.toothStates);
        state.versions = clone(before.versions);
        throw err;
      }
    },
  };
}
