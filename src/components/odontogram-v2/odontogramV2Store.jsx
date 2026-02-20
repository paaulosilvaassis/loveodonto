import { createContext, useContext, useMemo, useReducer } from 'react';
import { DEFAULT_TOOTH_STATE, FACES, FDI_DECIDUOUS, FDI_PERMANENT, STATUS_OPTIONS } from './odontogramV2Constants.js';

const OdontogramV2Context = createContext(null);

const buildInitialTeeth = () =>
  [...FDI_PERMANENT, ...FDI_DECIDUOUS].reduce((acc, id) => {
    acc[id] = { id, ...DEFAULT_TOOTH_STATE, surfaces: { ...DEFAULT_TOOTH_STATE.surfaces } };
    return acc;
  }, {});

const buildDraftFromTooth = (tooth) => ({
  status: tooth?.status || DEFAULT_TOOTH_STATE.status,
  notes: tooth?.notes || '',
  surfaces: { ...DEFAULT_TOOTH_STATE.surfaces, ...(tooth?.surfaces || {}) },
  implant: Boolean(tooth?.implant),
});

const isMissingStatus = (status) => ['AUSENTE', 'EXTRACAO'].includes(status);

const statusLabel = (value) =>
  STATUS_OPTIONS.find((item) => item.value === value)?.label || value || '';

const createHistoryEntry = ({ toothId, surfaces, status }) => ({
  id: `hist-${crypto.randomUUID()}`,
  tooth: toothId,
  surfaces: surfaces || [],
  status,
  statusLabel: statusLabel(status),
  at: new Date().toISOString(),
});

const appendHistory = (history, entry) => {
  const next = [entry, ...(history || [])];
  if (next.length > 500) return next.slice(0, 500);
  return next;
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'SELECT_TOOTH': {
      const tooth = state.teeth[action.payload.id];
      return {
        ...state,
        selectedToothId: action.payload.id,
        drawerOpen: Boolean(action.payload.openDrawer),
        draft: buildDraftFromTooth(tooth),
      };
    }
    case 'SET_ACTIVE_STATUS':
      return { ...state, activeStatus: action.payload };
    case 'TOGGLE_SURFACE_DIRECT': {
      const { id, surface } = action.payload;
      const tooth = state.teeth[id];
      if (!tooth) return state;
      if (isMissingStatus(tooth.status)) return state;
      const nextSurfaces = { ...tooth.surfaces, [surface]: !tooth.surfaces[surface] };
      const nextStatus = state.activeStatus;
      const entry = createHistoryEntry({
        toothId: id,
        surfaces: [surface],
        status: nextStatus,
      });
      return {
        ...state,
        selectedToothId: id,
        teeth: {
          ...state.teeth,
          [id]: { ...tooth, status: nextStatus, surfaces: nextSurfaces },
        },
        history: appendHistory(state.history, entry),
      };
    }
    case 'SET_DRAFT_STATUS':
      return {
        ...state,
        draft: {
          ...state.draft,
          status: action.payload,
          surfaces: isMissingStatus(action.payload) ? { ...DEFAULT_TOOTH_STATE.surfaces } : state.draft.surfaces,
          implant: isMissingStatus(action.payload) ? false : state.draft.implant,
        },
      };
    case 'SET_DRAFT_NOTES':
      return { ...state, draft: { ...state.draft, notes: action.payload } };
    case 'TOGGLE_DRAFT_SURFACE':
      if (isMissingStatus(state.draft.status)) return state;
      return {
        ...state,
        draft: {
          ...state.draft,
          surfaces: {
            ...state.draft.surfaces,
            [action.payload]: !state.draft.surfaces[action.payload],
          },
        },
      };
    case 'TOGGLE_DRAFT_IMPLANT':
      if (isMissingStatus(state.draft.status)) return state;
      return {
        ...state,
        draft: { ...state.draft, implant: !state.draft.implant },
      };
    case 'SET_DRAFT_ALL_SURFACES': {
      const nextSurfaces = FACES.reduce((acc, face) => {
        acc[face] = action.payload;
        return acc;
      }, {});
      return { ...state, draft: { ...state.draft, surfaces: nextSurfaces } };
    }
    case 'APPLY_DRAFT': {
      const id = state.selectedToothId;
      if (!id) return state;
      const tooth = state.teeth[id];
      const nextStatus = state.draft.status;
      const entry = createHistoryEntry({
        toothId: id,
        surfaces: Object.entries(state.draft.surfaces || {})
          .filter(([, value]) => value)
          .map(([face]) => face),
        status: nextStatus,
      });
      return {
        ...state,
        teeth: {
          ...state.teeth,
          [id]: {
            ...tooth,
            status: nextStatus,
            notes: state.draft.notes || '',
            surfaces: isMissingStatus(nextStatus) ? { ...DEFAULT_TOOTH_STATE.surfaces } : { ...state.draft.surfaces },
            implant: isMissingStatus(nextStatus) ? false : Boolean(state.draft.implant),
          },
        },
        history: appendHistory(state.history, entry),
      };
    }
    case 'RESET_DRAFT': {
      const tooth = state.teeth[state.selectedToothId];
      return { ...state, draft: buildDraftFromTooth(tooth) };
    }
    case 'SET_DRAWER_OPEN':
      return { ...state, drawerOpen: action.payload };
    case 'LOAD_STATE': {
      const base = buildInitialTeeth();
      const incoming = action.payload.teeth || {};
      const merged = { ...base };
      Object.entries(incoming).forEach(([key, value]) => {
        if (!merged[key]) return;
        merged[key] = {
          ...merged[key],
          ...value,
          surfaces: { ...merged[key].surfaces, ...(value.surfaces || {}) },
          implant: Boolean(value.implant),
        };
      });
      return {
        ...state,
        teeth: merged,
        history: action.payload.history || [],
        selectedToothId: null,
        drawerOpen: false,
        draft: buildDraftFromTooth(null),
      };
    }
    case 'IMPORT_JSON': {
      const nextTeeth = buildInitialTeeth();
      (action.payload || []).forEach((item) => {
        if (!item?.id) return;
        if (!nextTeeth[item.id]) return;
        nextTeeth[item.id] = {
          ...nextTeeth[item.id],
          status: item.status || nextTeeth[item.id].status,
          notes: item.notes || '',
          surfaces: { ...nextTeeth[item.id].surfaces, ...(item.surfaces || {}) },
          implant: Boolean(item.implant),
        };
      });
      return {
        ...state,
        teeth: nextTeeth,
        selectedToothId: null,
        draft: buildDraftFromTooth(null),
      };
    }
    default:
      return state;
  }
};

export const OdontogramV2Provider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, {
    teeth: buildInitialTeeth(),
    selectedToothId: null,
    drawerOpen: false,
    activeStatus: DEFAULT_TOOTH_STATE.status,
    draft: buildDraftFromTooth(null),
    history: [],
  });

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <OdontogramV2Context.Provider value={value}>{children}</OdontogramV2Context.Provider>;
};

export const useOdontogramV2 = () => {
  const ctx = useContext(OdontogramV2Context);
  if (!ctx) {
    throw new Error('useOdontogramV2 deve ser usado dentro de OdontogramV2Provider.');
  }
  return ctx;
};
